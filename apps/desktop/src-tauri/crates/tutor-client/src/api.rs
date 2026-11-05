//! Request bodies for, and stream events from, `POST /v1/messages`.

use serde::{Deserialize, Serialize};

use crate::error::{classify_api_error, rejected, ApiErrorBody, TutorError};
use crate::sse::SseEvent;
use crate::types::{ChatMessage, Completion, Effort, Role, TutorRequest, TutorUsage};

pub const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";
/// The API accepts at most four `cache_control` breakpoints per request.
const MAX_CACHE_BREAKPOINTS: usize = 4;
/// Upper bound accepted from the web view; the current models allow 128K output tokens.
pub const MAX_OUTPUT_TOKENS: u32 = 128_000;
/// `max_tokens` for the key test (see the IPC contract).
pub const TEST_MAX_TOKENS: u32 = 16;

#[derive(Serialize)]
struct Body<'a> {
    model: &'a str,
    max_tokens: u32,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    system: Vec<SystemText<'a>>,
    messages: Vec<MessageParam<'a>>,
    output_config: OutputConfig,
}

#[derive(Serialize)]
struct SystemText<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}

#[derive(Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct MessageParam<'a> {
    role: Role,
    content: &'a str,
}

#[derive(Serialize)]
struct OutputConfig {
    effort: Effort,
}

fn invalid(message: &str) -> TutorError {
    TutorError::InvalidRequest(message.to_owned())
}

/// Checks the request from the web view and serializes the streaming body.
///
/// Empty system blocks are dropped (the API rejects empty text blocks). If more than four
/// blocks ask for caching, only the last four keep their breakpoint: a breakpoint caches
/// everything before it, so the later ones cover the earlier.
pub fn stream_body(request: &TutorRequest) -> Result<Vec<u8>, TutorError> {
    if request.model.trim().is_empty() {
        return Err(invalid("ingen modell är vald."));
    }
    if request.max_tokens == 0 || request.max_tokens > MAX_OUTPUT_TOKENS {
        return Err(invalid(&format!(
            "maxTokens måste vara mellan 1 och {MAX_OUTPUT_TOKENS}."
        )));
    }
    if request.messages.is_empty() {
        return Err(invalid("samtalet saknar meddelanden."));
    }
    if request
        .messages
        .iter()
        .any(|message| message.content.trim().is_empty())
    {
        return Err(invalid("ett meddelande i samtalet är tomt."));
    }
    if request.messages.last().map(|message| message.role) != Some(Role::User) {
        return Err(invalid("det sista meddelandet måste vara din fråga."));
    }

    let system: Vec<_> = request
        .system
        .iter()
        .filter(|block| !block.text.trim().is_empty())
        .collect();
    let cached_total = system.iter().filter(|block| block.cache).count();
    let mut cached_seen = 0;
    let system = system
        .into_iter()
        .map(|block| {
            let mut cache_control = None;
            if block.cache {
                cached_seen += 1;
                if cached_total - cached_seen < MAX_CACHE_BREAKPOINTS {
                    cache_control = Some(CacheControl { kind: "ephemeral" });
                }
            }
            SystemText {
                kind: "text",
                text: &block.text,
                cache_control,
            }
        })
        .collect();

    to_json(&Body {
        model: request.model.trim(),
        max_tokens: request.max_tokens,
        stream: true,
        system,
        messages: request.messages.iter().map(message_param).collect(),
        output_config: OutputConfig {
            effort: request.effort,
        },
    })
}

/// The small non-streaming body used to test a key.
pub fn test_body(model: &str) -> Result<Vec<u8>, TutorError> {
    if model.trim().is_empty() {
        return Err(invalid("ingen modell är vald."));
    }
    let question = ChatMessage {
        role: Role::User,
        content: "Svara med ordet ok.".to_owned(),
    };
    to_json(&Body {
        model: model.trim(),
        max_tokens: TEST_MAX_TOKENS,
        stream: false,
        system: Vec::new(),
        messages: vec![message_param(&question)],
        output_config: OutputConfig {
            effort: Effort::Low,
        },
    })
}

fn message_param(message: &ChatMessage) -> MessageParam<'_> {
    MessageParam {
        role: message.role,
        content: &message.content,
    }
}

fn to_json(body: &Body<'_>) -> Result<Vec<u8>, TutorError> {
    serde_json::to_vec(body).map_err(|e| TutorError::InvalidRequest(e.to_string()))
}

/// The `model` of a non-streaming response.
pub fn model_of_response(body: &str) -> Result<String, TutorError> {
    #[derive(Deserialize)]
    struct Response {
        model: String,
    }
    serde_json::from_str::<Response>(body)
        .map(|response| response.model)
        .map_err(|_| TutorError::Protocol("svaret på testfrågan gick inte att läsa".to_owned()))
}

// --- Streaming -------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Payload {
    #[serde(rename = "message_start")]
    MessageStart { message: StartMessage },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { delta: Delta },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: MessageDeltaBody,
        #[serde(default)]
        usage: Option<UsagePatch>,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "error")]
    Error { error: ApiErrorBody },
    /// `ping`, `content_block_start`, `content_block_stop` and future event types.
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct StartMessage {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    usage: Option<UsagePatch>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Delta {
    #[serde(rename = "text_delta")]
    Text { text: String },
    /// `thinking_delta`, `signature_delta`, `input_json_delta`, ...
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct MessageDeltaBody {
    #[serde(default)]
    stop_reason: Option<String>,
}

/// Usage fields; any of them may be missing or null depending on the event.
#[derive(Deserialize, Default)]
struct UsagePatch {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
}

impl UsagePatch {
    fn apply(self, usage: &mut TutorUsage) {
        if let Some(n) = self.input_tokens {
            usage.input_tokens = n;
        }
        if let Some(n) = self.output_tokens {
            usage.output_tokens = n;
        }
        if let Some(n) = self.cache_read_input_tokens {
            usage.cache_read_input_tokens = n;
        }
        if let Some(n) = self.cache_creation_input_tokens {
            usage.cache_creation_input_tokens = n;
        }
    }
}

/// Folds the stream events of one answer into text pieces, usage and a stop reason.
#[derive(Debug)]
pub struct StreamAccumulator {
    usage: TutorUsage,
    stop_reason: Option<String>,
    stopped: bool,
}

impl StreamAccumulator {
    /// `model` is the requested model; `message_start` replaces it with the served one.
    pub fn new(model: &str) -> Self {
        Self {
            usage: TutorUsage {
                model: model.to_owned(),
                ..TutorUsage::default()
            },
            stop_reason: None,
            stopped: false,
        }
    }

    /// Handles one event and returns the text it adds, if any. An `error` event becomes `Err`.
    pub fn handle(&mut self, event: &SseEvent) -> Result<Option<String>, TutorError> {
        if self.stopped {
            return Ok(None);
        }
        let payload: Payload = match serde_json::from_str(&event.data) {
            Ok(payload) => payload,
            Err(_) if !is_known_event(&event.event) => return Ok(None),
            Err(e) => {
                return Err(TutorError::Protocol(format!(
                    "händelsen {} gick inte att läsa ({e})",
                    event.event
                )))
            }
        };
        match payload {
            Payload::MessageStart { message } => {
                if let Some(model) = message.model.filter(|m| !m.is_empty()) {
                    self.usage.model = model;
                }
                if let Some(usage) = message.usage {
                    usage.apply(&mut self.usage);
                }
            }
            Payload::ContentBlockDelta {
                delta: Delta::Text { text },
            } if !text.is_empty() => return Ok(Some(text)),
            Payload::ContentBlockDelta { .. } => {}
            Payload::MessageDelta { delta, usage } => {
                if let Some(reason) = delta.stop_reason {
                    self.stop_reason = Some(reason);
                }
                if let Some(usage) = usage {
                    usage.apply(&mut self.usage);
                }
            }
            Payload::MessageStop => self.stopped = true,
            Payload::Error { error } => {
                return Err(classify_api_error(&error.kind, &error.message)
                    .unwrap_or_else(|| rejected(&error.message, 400)));
            }
            Payload::Other => {}
        }
        Ok(None)
    }

    /// `message_stop` has arrived; later events are ignored.
    pub fn is_stopped(&self) -> bool {
        self.stopped
    }

    /// Ends the answer. Without a stop reason the stream was cut off.
    pub fn finish(self) -> Result<Completion, TutorError> {
        match self.stop_reason {
            Some(stop_reason) => Ok(Completion {
                usage: self.usage,
                stop_reason,
            }),
            None => Err(TutorError::Interrupted),
        }
    }
}

fn is_known_event(name: &str) -> bool {
    matches!(
        name,
        "message_start" | "content_block_delta" | "message_delta" | "message_stop" | "error"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::SystemBlock;
    use serde_json::{json, Value};

    fn request(system: Vec<SystemBlock>) -> TutorRequest {
        TutorRequest {
            model: "claude-opus-5-5".into(),
            max_tokens: 2000,
            effort: Effort::Medium,
            system,
            messages: vec![ChatMessage {
                role: Role::User,
                content: "Vad är en bygglovsplikt?".into(),
            }],
        }
    }

    fn block(text: &str, cache: bool) -> SystemBlock {
        SystemBlock {
            text: text.into(),
            cache,
        }
    }

    #[test]
    fn stream_body_shape() {
        let body =
            stream_body(&request(vec![block("Roll", false), block("Kontext", true)])).unwrap();
        let body: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            body,
            json!({
                "model": "claude-opus-5-5",
                "max_tokens": 2000,
                "stream": true,
                "system": [
                    { "type": "text", "text": "Roll" },
                    { "type": "text", "text": "Kontext", "cache_control": { "type": "ephemeral" } }
                ],
                "messages": [{ "role": "user", "content": "Vad är en bygglovsplikt?" }],
                "output_config": { "effort": "medium" }
            })
        );
    }

    #[test]
    fn at_most_four_breakpoints_keeping_the_last() {
        let system = (0..6).map(|i| block(&format!("b{i}"), true)).collect();
        let body: Value = serde_json::from_slice(&stream_body(&request(system)).unwrap()).unwrap();
        let marked: Vec<bool> = body["system"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b.get("cache_control").is_some())
            .collect();
        assert_eq!(marked, vec![false, false, true, true, true, true]);
    }

    #[test]
    fn empty_system_blocks_and_system_are_dropped() {
        let body: Value =
            serde_json::from_slice(&stream_body(&request(vec![block("  ", true)])).unwrap())
                .unwrap();
        assert!(body.get("system").is_none());
    }

    #[test]
    fn rejects_bad_requests() {
        let mut r = request(vec![]);
        r.messages.clear();
        assert!(matches!(
            stream_body(&r),
            Err(TutorError::InvalidRequest(_))
        ));

        let mut r = request(vec![]);
        r.max_tokens = 0;
        assert!(matches!(
            stream_body(&r),
            Err(TutorError::InvalidRequest(_))
        ));

        let mut r = request(vec![]);
        r.messages.push(ChatMessage {
            role: Role::Assistant,
            content: "Svar".into(),
        });
        assert!(matches!(
            stream_body(&r),
            Err(TutorError::InvalidRequest(_))
        ));

        let mut r = request(vec![]);
        r.messages[0].content = " ".into();
        assert!(matches!(
            stream_body(&r),
            Err(TutorError::InvalidRequest(_))
        ));
    }

    #[test]
    fn test_body_shape() {
        let body: Value = serde_json::from_slice(&test_body("claude-haiku-5-5").unwrap()).unwrap();
        assert_eq!(
            body,
            json!({
                "model": "claude-haiku-5-5",
                "max_tokens": 16,
                "messages": [{ "role": "user", "content": "Svara med ordet ok." }],
                "output_config": { "effort": "low" }
            })
        );
    }

    #[test]
    fn unknown_events_and_garbage_in_unknown_events_are_ignored() {
        let mut acc = StreamAccumulator::new("m");
        let event = |name: &str, data: &str| SseEvent {
            event: name.into(),
            data: data.into(),
        };
        assert_eq!(acc.handle(&event("ping", r#"{"type":"ping"}"#)), Ok(None));
        assert_eq!(acc.handle(&event("future_event", "not json")), Ok(None));
        assert_eq!(
            acc.handle(&event("something_new", r#"{"type":"something_new","x":1}"#)),
            Ok(None)
        );
        assert!(matches!(
            acc.handle(&event("message_delta", "{broken")),
            Err(TutorError::Protocol(_))
        ));
    }
}
