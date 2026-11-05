//! End-to-end tests of `TutorClient` against recorded responses, through a fake transport.

use std::collections::VecDeque;
use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use futures_util::stream;
use serde_json::{json, Value};
use tutor_client::{
    ChatMessage, Effort, HttpRequest, HttpResponse, Role, SystemBlock, Transport, TutorClient,
    TutorError, TutorEvent, TutorRequest, TutorUsage,
};

const NORMAL: &str = include_str!("fixtures/normal_cache_read.sse");
const REFUSAL: &str = include_str!("fixtures/refusal.sse");
const ERROR_EVENT: &str = include_str!("fixtures/error_event.sse");
const TRUNCATED: &str = include_str!("fixtures/truncated.sse");
const HTTP_401: &str = include_str!("fixtures/http_401.body");
const HTTP_429: &str = include_str!("fixtures/http_429.body");
const HTTP_529: &str = include_str!("fixtures/http_529.body");
const TEST_KEY_OK: &str = include_str!("fixtures/test_key_ok.body");

const KEY: &str = "sk-ant-api03-test";

/// What the fake transport answers with, one entry per request.
enum Reply {
    Http {
        status: u16,
        retry_after: Option<&'static str>,
        chunks: Vec<Vec<u8>>,
        /// Fail the body stream after the chunks.
        then_fail: bool,
    },
    Unreachable,
}

fn ok(body: &str) -> Reply {
    ok_chunks(vec![body.as_bytes().to_vec()])
}

fn ok_chunks(chunks: Vec<Vec<u8>>) -> Reply {
    Reply::Http {
        status: 200,
        retry_after: None,
        chunks,
        then_fail: false,
    }
}

fn status(status: u16, retry_after: Option<&'static str>, body: &str) -> Reply {
    Reply::Http {
        status,
        retry_after,
        chunks: vec![body.as_bytes().to_vec()],
        then_fail: false,
    }
}

struct Sent {
    url: String,
    api_key: String,
    body: Value,
}

#[derive(Default)]
struct FakeTransport {
    replies: Mutex<VecDeque<Reply>>,
    sent: Mutex<Vec<Sent>>,
}

impl FakeTransport {
    fn new(replies: Vec<Reply>) -> Self {
        Self {
            replies: Mutex::new(replies.into()),
            sent: Mutex::default(),
        }
    }
}

impl Transport for FakeTransport {
    fn post(
        &self,
        request: HttpRequest,
    ) -> impl Future<Output = Result<HttpResponse, TutorError>> + Send {
        self.sent.lock().unwrap().push(Sent {
            url: request.url,
            api_key: request.api_key,
            body: serde_json::from_slice(&request.body).unwrap(),
        });
        let reply = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .expect("unexpected request");
        async move {
            match reply {
                Reply::Unreachable => Err(TutorError::Network {
                    detail: "dns error".into(),
                }),
                Reply::Http {
                    status,
                    retry_after,
                    chunks,
                    then_fail,
                } => {
                    let mut items: Vec<Result<Vec<u8>, TutorError>> =
                        chunks.into_iter().map(Ok).collect();
                    if then_fail {
                        items.push(Err(TutorError::Interrupted));
                    }
                    Ok(HttpResponse {
                        status,
                        retry_after: retry_after.map(str::to_owned),
                        body: Box::pin(stream::iter(items)),
                    })
                }
            }
        }
    }
}

fn client(replies: Vec<Reply>) -> TutorClient<FakeTransport> {
    TutorClient::with_transport(FakeTransport::new(replies))
        .with_retry_delays(vec![Duration::ZERO, Duration::ZERO])
}

fn sent(client: &TutorClient<FakeTransport>) -> std::sync::MutexGuard<'_, Vec<Sent>> {
    client.transport().sent.lock().unwrap()
}

fn request() -> TutorRequest {
    TutorRequest {
        model: "claude-opus-5-5".into(),
        max_tokens: 4000,
        effort: Effort::High,
        system: vec![
            SystemBlock {
                text: "Du är handledare för en blivande bygglovshandläggare.".into(),
                cache: false,
            },
            SystemBlock {
                text: "Modulens lagrumssammanfattning ...".into(),
                cache: true,
            },
        ],
        messages: vec![ChatMessage {
            role: Role::User,
            content: "Krävs bygglov för en tillbyggnad?".into(),
        }],
    }
}

async fn ask(
    client: &TutorClient<FakeTransport>,
) -> (Vec<String>, Result<tutor_client::Completion, TutorError>) {
    let mut texts = Vec::new();
    let result = client
        .stream_message(KEY, &request(), |text| texts.push(text))
        .await;
    (texts, result)
}

const NORMAL_TEXT: &str = "En tillbyggnad kräver normalt bygglov enligt 9 kap. PBL.\n\n\
                           Kontrollera \"detaljplanen\" och åäö-tecken – § står kvar.";

fn normal_usage() -> TutorUsage {
    TutorUsage {
        input_tokens: 58,
        output_tokens: 214,
        cache_read_input_tokens: 3184,
        cache_creation_input_tokens: 0,
        model: "claude-opus-5-5".into(),
    }
}

#[tokio::test]
async fn streams_text_and_usage_with_cache_read() {
    let client = client(vec![ok(NORMAL)]);
    let (texts, result) = ask(&client).await;
    let completion = result.unwrap();
    assert_eq!(
        texts.len(),
        3,
        "one callback per text delta, thinking skipped"
    );
    assert_eq!(texts.concat(), NORMAL_TEXT);
    assert_eq!(completion.stop_reason, "end_turn");
    assert!(!completion.is_refusal());
    assert_eq!(completion.usage, normal_usage());

    let sent = sent(&client);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].url, "https://api.anthropic.com/v1/messages");
    assert_eq!(sent[0].api_key, KEY);
    assert_eq!(
        sent[0].body,
        json!({
            "model": "claude-opus-5-5",
            "max_tokens": 4000,
            "stream": true,
            "system": [
                { "type": "text", "text": "Du är handledare för en blivande bygglovshandläggare." },
                {
                    "type": "text",
                    "text": "Modulens lagrumssammanfattning ...",
                    "cache_control": { "type": "ephemeral" }
                }
            ],
            "messages": [{ "role": "user", "content": "Krävs bygglov för en tillbyggnad?" }],
            "output_config": { "effort": "high" }
        })
    );
}

#[tokio::test]
async fn same_result_for_any_chunking_and_crlf() {
    let byte_chunks: Vec<Vec<u8>> = NORMAL.as_bytes().chunks(1).map(<[u8]>::to_vec).collect();
    let odd_chunks: Vec<Vec<u8>> = NORMAL.as_bytes().chunks(7).map(<[u8]>::to_vec).collect();
    let crlf = NORMAL.replace('\n', "\r\n");
    for reply in [
        ok_chunks(byte_chunks),
        ok_chunks(odd_chunks),
        ok(&crlf),
        ok(NORMAL.trim_end()),
    ] {
        let client = client(vec![reply]);
        let (texts, result) = ask(&client).await;
        assert_eq!(texts.concat(), NORMAL_TEXT);
        assert_eq!(result.unwrap().usage, normal_usage());
    }
}

#[tokio::test]
async fn refusal_is_a_completion_without_text() {
    let client = client(vec![ok(REFUSAL)]);
    let (texts, result) = ask(&client).await;
    let completion = result.unwrap();
    assert!(texts.is_empty());
    assert!(completion.is_refusal());
    assert_eq!(completion.stop_reason, "refusal");
    assert_eq!(
        completion.usage,
        TutorUsage {
            input_tokens: 31,
            output_tokens: 4,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 2950,
            model: "claude-haiku-5-5".into(),
        }
    );
}

#[tokio::test]
async fn error_event_mid_stream() {
    let client = client(vec![ok(ERROR_EVENT)]);
    let (texts, result) = ask(&client).await;
    assert_eq!(texts, vec!["Det beror på".to_owned()]);
    let error = result.unwrap_err();
    assert_eq!(error, TutorError::Overloaded);
    assert!(error.to_string().contains("överbelastad"));
    // Text was already shown, so it is not retried.
    assert_eq!(sent(&client).len(), 1);
}

#[tokio::test]
async fn http_401_is_an_invalid_key() {
    let client = client(vec![status(401, None, HTTP_401)]);
    let (texts, result) = ask(&client).await;
    assert!(texts.is_empty());
    let error = result.unwrap_err();
    assert_eq!(error, TutorError::InvalidKey);
    assert!(error.to_string().starts_with("API-nyckeln godtogs inte"));
    assert_eq!(sent(&client).len(), 1, "401 is not retried");
}

#[tokio::test]
async fn http_429_with_retry_after() {
    let client = client(vec![status(429, Some("17"), HTTP_429)]);
    let (_, result) = ask(&client).await;
    let error = result.unwrap_err();
    assert_eq!(
        error,
        TutorError::RateLimited {
            retry_after_secs: Some(17)
        }
    );
    assert!(error.to_string().contains("om 17 sekunder"));
    assert_eq!(sent(&client).len(), 1, "429 is not retried automatically");
}

#[tokio::test]
async fn overloaded_is_retried_before_streaming() {
    let client = client(vec![status(529, None, HTTP_529), ok(NORMAL)]);
    let (texts, result) = ask(&client).await;
    assert_eq!(texts.concat(), NORMAL_TEXT);
    assert!(result.is_ok());
    assert_eq!(sent(&client).len(), 2);
}

#[tokio::test]
async fn gives_up_after_the_retries() {
    let client = client(vec![
        status(529, None, HTTP_529),
        status(503, None, ""),
        status(529, None, HTTP_529),
    ]);
    let (_, result) = ask(&client).await;
    assert_eq!(result.unwrap_err(), TutorError::Overloaded);
    assert_eq!(sent(&client).len(), 3);
}

#[tokio::test]
async fn unreachable_network() {
    let client = client(vec![
        Reply::Unreachable,
        Reply::Unreachable,
        Reply::Unreachable,
    ]);
    let (_, result) = ask(&client).await;
    let error = result.unwrap_err();
    assert!(matches!(error, TutorError::Network { .. }));
    assert_eq!(
        error.to_string(),
        "Kunde inte nå Anthropic. Kontrollera internetanslutningen och försök igen."
    );
}

#[tokio::test]
async fn stream_that_ends_early_is_interrupted() {
    let client = client(vec![ok(TRUNCATED)]);
    let (texts, result) = ask(&client).await;
    assert_eq!(texts, vec!["Halvt sv".to_owned()]);
    assert_eq!(result.unwrap_err(), TutorError::Interrupted);

    let client = self::client(vec![Reply::Http {
        status: 200,
        retry_after: None,
        chunks: vec![TRUNCATED.as_bytes().to_vec()],
        then_fail: true,
    }]);
    let (_, result) = ask(&client).await;
    assert_eq!(result.unwrap_err(), TutorError::Interrupted);
}

#[tokio::test]
async fn broken_connection_after_stop_reason_still_completes() {
    let without_stop = NORMAL
        .split("event: message_stop")
        .next()
        .unwrap()
        .to_owned();
    let client = client(vec![Reply::Http {
        status: 200,
        retry_after: None,
        chunks: vec![without_stop.into_bytes()],
        then_fail: true,
    }]);
    let (_, result) = ask(&client).await;
    assert_eq!(result.unwrap().stop_reason, "end_turn");
}

#[tokio::test]
async fn invalid_request_is_not_sent() {
    let client = client(vec![]);
    let mut request = request();
    request.messages.clear();
    let result = client.stream_message(KEY, &request, |_| {}).await;
    assert!(matches!(result, Err(TutorError::InvalidRequest(_))));
    assert!(sent(&client).is_empty());
}

#[tokio::test]
async fn test_key_reads_the_model() {
    let client = client(vec![ok(TEST_KEY_OK)]);
    let check = client.test_key(KEY, "claude-haiku-5-5").await.unwrap();
    assert_eq!(check.model, "claude-haiku-5-5");
    let sent = sent(&client);
    assert_eq!(sent[0].body["max_tokens"], 16);
    assert!(sent[0].body.get("stream").is_none());
    for forbidden in ["temperature", "top_p", "top_k", "thinking"] {
        assert!(sent[0].body.get(forbidden).is_none());
    }
}

#[tokio::test]
async fn test_key_with_a_bad_key() {
    let client = client(vec![status(401, None, HTTP_401)]);
    assert_eq!(
        client.test_key(KEY, "claude-opus-5-5").await.unwrap_err(),
        TutorError::InvalidKey
    );
}

#[test]
fn ipc_payloads_are_camel_case() {
    let request: TutorRequest = serde_json::from_value(json!({
        "model": "claude-opus-5-5",
        "maxTokens": 1500,
        "effort": "low",
        "system": [{ "text": "Roll", "cache": true }],
        "messages": [
            { "role": "user", "content": "Fråga" },
            { "role": "assistant", "content": "Svar" },
            { "role": "user", "content": "Följdfråga" }
        ]
    }))
    .unwrap();
    assert_eq!(request.max_tokens, 1500);
    assert_eq!(request.effort, Effort::Low);
    assert_eq!(request.messages[1].role, Role::Assistant);

    assert_eq!(
        serde_json::to_value(TutorEvent::Text { text: "Hej".into() }).unwrap(),
        json!({ "type": "text", "text": "Hej" })
    );
    assert_eq!(
        serde_json::to_value(TutorEvent::Done {
            usage: normal_usage(),
            stop_reason: "end_turn".into()
        })
        .unwrap(),
        json!({
            "type": "done",
            "usage": {
                "inputTokens": 58,
                "outputTokens": 214,
                "cacheReadInputTokens": 3184,
                "cacheCreationInputTokens": 0,
                "model": "claude-opus-5-5"
            },
            "stopReason": "end_turn"
        })
    );
    assert_eq!(
        serde_json::to_value(TutorEvent::Error {
            message: "Fel".into()
        })
        .unwrap(),
        json!({ "type": "error", "message": "Fel" })
    );
    assert_eq!(
        serde_json::to_value(tutor_client::KeyTestResult {
            ok: true,
            model: "claude-opus-5-5".into(),
            message: "ok".into()
        })
        .unwrap(),
        json!({ "ok": true, "model": "claude-opus-5-5", "message": "ok" })
    );
}

/// Tauri runs async commands on a multi-threaded runtime, so the futures must be `Send`.
#[test]
fn futures_are_send() {
    fn assert_send<T: Send>(_: &T) {}
    let request = request();
    let channel_like = std::sync::Arc::new(Mutex::new(Vec::<String>::new()));
    let sink = channel_like.clone();
    let future = tutor_client::stream_message(KEY, &request, move |text| {
        sink.lock().unwrap().push(text);
    });
    assert_send(&future);
    let future = tutor_client::test_key(KEY, "claude-opus-5-5");
    assert_send(&future);
}
