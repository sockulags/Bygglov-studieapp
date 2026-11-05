//! Client for the Anthropic Messages API used by the study assistant ("Studiehjälp").
//!
//! It has no Tauri dependency, so it builds and tests anywhere; the Tauri commands in
//! `src-tauri/src/tutor.rs` are a thin layer over [`stream_message`] and [`test_key`].
//!
//! - [`sse`]: incremental Server-Sent Events parser.
//! - [`api`]: request bodies and the fold from stream events to text and usage.
//! - [`transport`]: the network, behind the [`Transport`] trait (reqwest + rustls in the app,
//!   a fake in the tests).
//! - [`error`]: [`TutorError`], whose `Display` is the Swedish message shown to the user.

pub mod api;
pub mod error;
pub mod sse;
pub mod transport;
pub mod types;

use std::sync::OnceLock;
use std::time::Duration;

use futures_util::StreamExt;

pub use error::TutorError;
pub use transport::{BodyStream, HttpRequest, HttpResponse, ReqwestTransport, Transport};
pub use types::{
    ChatMessage, Completion, Effort, KeyCheck, KeyTestResult, Role, SystemBlock, TutorEvent,
    TutorRequest, TutorUsage,
};

use api::StreamAccumulator;
use error::classify_http_error;
use sse::SseParser;

/// Error bodies are short; anything longer is cut before it is parsed.
const MAX_ERROR_BODY: usize = 64 * 1024;
/// A non-streaming test answer is a few hundred bytes.
const MAX_TEST_BODY: usize = 256 * 1024;

/// A client bound to a transport and an endpoint.
pub struct TutorClient<T> {
    transport: T,
    url: String,
    /// Waits before each automatic retry of an overloaded/5xx/unreachable API. Retries
    /// happen only before any text has been streamed, so nothing is shown twice.
    retry_delays: Vec<Duration>,
}

impl TutorClient<ReqwestTransport> {
    pub fn new() -> Result<Self, TutorError> {
        Ok(Self::with_transport(ReqwestTransport::new()?))
    }
}

impl<T: Transport> TutorClient<T> {
    pub fn with_transport(transport: T) -> Self {
        Self {
            transport,
            url: api::MESSAGES_URL.to_owned(),
            retry_delays: vec![Duration::from_secs(1), Duration::from_secs(3)],
        }
    }

    pub fn with_url(mut self, url: impl Into<String>) -> Self {
        self.url = url.into();
        self
    }

    pub fn with_retry_delays(mut self, delays: Vec<Duration>) -> Self {
        self.retry_delays = delays;
        self
    }

    pub fn transport(&self) -> &T {
        &self.transport
    }

    /// Streams one answer. `on_text` gets each text delta as it arrives (thinking is not
    /// passed on). Returns the usage and stop reason; `stop_reason == "refusal"` means the
    /// safety filter declined, see [`Completion::is_refusal`].
    pub async fn stream_message<F>(
        &self,
        api_key: &str,
        request: &TutorRequest,
        mut on_text: F,
    ) -> Result<Completion, TutorError>
    where
        F: FnMut(String) + Send,
    {
        let body = api::stream_body(request)?;
        let response = self.send(api_key, body).await?;
        let mut stream = response.body;
        let mut parser = SseParser::new();
        let mut acc = StreamAccumulator::new(request.model.trim());

        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => return finish_after_broken_stream(acc, error),
            };
            for event in parser.feed(&chunk) {
                if let Some(text) = acc.handle(&event)? {
                    on_text(text);
                }
            }
            if acc.is_stopped() {
                return acc.finish();
            }
        }
        for event in parser.finish() {
            if let Some(text) = acc.handle(&event)? {
                on_text(text);
            }
        }
        acc.finish()
    }

    /// Sends a minimal non-streaming request (`max_tokens` 16) to check key and model.
    pub async fn test_key(&self, api_key: &str, model: &str) -> Result<KeyCheck, TutorError> {
        let body = api::test_body(model)?;
        let response = self.send(api_key, body).await?;
        let text = read_body(response.body, MAX_TEST_BODY).await?;
        Ok(KeyCheck {
            model: api::model_of_response(&text)?,
        })
    }

    /// Posts and returns a 200 response, retrying transient failures.
    async fn send(&self, api_key: &str, body: Vec<u8>) -> Result<HttpResponse, TutorError> {
        let mut attempt = 0;
        loop {
            let result = match self
                .transport
                .post(HttpRequest {
                    url: self.url.clone(),
                    api_key: api_key.to_owned(),
                    body: body.clone(),
                })
                .await
            {
                Ok(response) if response.status == 200 => return Ok(response),
                Ok(response) => {
                    let text = read_body(response.body, MAX_ERROR_BODY)
                        .await
                        .unwrap_or_default();
                    classify_http_error(response.status, response.retry_after.as_deref(), &text)
                }
                Err(error) => error,
            };
            match self.retry_delays.get(attempt) {
                Some(delay) if result.is_retryable() => {
                    tokio::time::sleep(*delay).await;
                    attempt += 1;
                }
                _ => return Err(result),
            }
        }
    }
}

/// A body error after `message_delta` has given a stop reason only loses `message_stop`.
fn finish_after_broken_stream(
    acc: StreamAccumulator,
    error: TutorError,
) -> Result<Completion, TutorError> {
    acc.finish().map_err(|_| match error {
        TutorError::Timeout => TutorError::Timeout,
        _ => TutorError::Interrupted,
    })
}

async fn read_body(mut body: BodyStream, limit: usize) -> Result<String, TutorError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = body.next().await {
        bytes.extend_from_slice(&chunk?);
        if bytes.len() >= limit {
            bytes.truncate(limit);
            break;
        }
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn shared_client() -> Result<&'static TutorClient<ReqwestTransport>, TutorError> {
    static CLIENT: OnceLock<Result<TutorClient<ReqwestTransport>, TutorError>> = OnceLock::new();
    CLIENT
        .get_or_init(TutorClient::new)
        .as_ref()
        .map_err(Clone::clone)
}

/// [`TutorClient::stream_message`] on a process-wide client (one connection pool).
pub async fn stream_message<F>(
    api_key: &str,
    request: &TutorRequest,
    on_text: F,
) -> Result<Completion, TutorError>
where
    F: FnMut(String) + Send,
{
    shared_client()?
        .stream_message(api_key, request, on_text)
        .await
}

/// [`TutorClient::test_key`] on the process-wide client.
pub async fn test_key(api_key: &str, model: &str) -> Result<KeyCheck, TutorError> {
    shared_client()?.test_key(api_key, model).await
}
