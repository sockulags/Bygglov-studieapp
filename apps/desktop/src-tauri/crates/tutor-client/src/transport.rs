//! The network layer, behind a trait so that the protocol code can be tested without it.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use futures_util::{Stream, StreamExt};
use reqwest::header::{HeaderValue, CONTENT_TYPE, RETRY_AFTER};

use crate::api::ANTHROPIC_VERSION;
use crate::error::TutorError;

/// A JSON POST to the Messages API. Deliberately not `Debug`: it carries the API key.
pub struct HttpRequest {
    pub url: String,
    pub api_key: String,
    pub body: Vec<u8>,
}

/// The response body as it arrives. A failing chunk ends the stream.
pub type BodyStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, TutorError>> + Send>>;

pub struct HttpResponse {
    pub status: u16,
    /// The `retry-after` header, if any.
    pub retry_after: Option<String>,
    pub body: BodyStream,
}

/// Sends one request. Errors are connection-level only; HTTP error statuses are returned
/// as responses.
pub trait Transport: Send + Sync {
    fn post(
        &self,
        request: HttpRequest,
    ) -> impl Future<Output = Result<HttpResponse, TutorError>> + Send;
}

/// The real transport: reqwest with rustls and the bundled web PKI roots.
#[derive(Clone)]
pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new() -> Result<Self, TutorError> {
        let client = reqwest::Client::builder()
            .user_agent(concat!(
                "bygglov-studieapp-tutor/",
                env!("CARGO_PKG_VERSION")
            ))
            .connect_timeout(Duration::from_secs(15))
            // Between bytes, not in total: an answer may stream for minutes, but the API
            // sends `ping` events while it is thinking.
            .read_timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| TutorError::Network {
                detail: e.to_string(),
            })?;
        Ok(Self { client })
    }
}

impl Transport for ReqwestTransport {
    fn post(
        &self,
        request: HttpRequest,
    ) -> impl Future<Output = Result<HttpResponse, TutorError>> + Send {
        let client = self.client.clone();
        async move {
            let mut key =
                HeaderValue::from_str(&request.api_key).map_err(|_| TutorError::InvalidKey)?;
            key.set_sensitive(true);
            let response = client
                .post(&request.url)
                .header("x-api-key", key)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .header(CONTENT_TYPE, "application/json")
                .body(request.body)
                .send()
                .await
                .map_err(connection_error)?;
            let status = response.status().as_u16();
            let retry_after = response
                .headers()
                .get(RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let body = response.bytes_stream().map(|chunk| {
                chunk.map(|bytes| bytes.to_vec()).map_err(|e| {
                    if e.is_timeout() {
                        TutorError::Timeout
                    } else {
                        TutorError::Interrupted
                    }
                })
            });
            Ok(HttpResponse {
                status,
                retry_after,
                body: Box::pin(body),
            })
        }
    }
}

fn connection_error(error: reqwest::Error) -> TutorError {
    if error.is_timeout() {
        TutorError::Timeout
    } else {
        // reqwest's message names the URL but never the headers, so the key stays out.
        TutorError::Network {
            detail: error.to_string(),
        }
    }
}
