//! The IPC payloads shared with the web view (camelCase JSON) and the call results.

use serde::{Deserialize, Serialize};

/// `output_config.effort`. Only the levels the app offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effort {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

/// One block of the system prompt. `cache: true` puts a cache breakpoint after it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SystemBlock {
    pub text: String,
    #[serde(default)]
    pub cache: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

/// `TutorRequest` in the IPC contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorRequest {
    pub model: String,
    pub max_tokens: u32,
    pub effort: Effort,
    #[serde(default)]
    pub system: Vec<SystemBlock>,
    pub messages: Vec<ChatMessage>,
}

/// `TutorUsage` in the IPC contract. Token counts as reported by the API.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub model: String,
}

/// `TutorEvent` in the IPC contract, sent over a `tauri::ipc::Channel`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TutorEvent {
    Text {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        usage: TutorUsage,
        stop_reason: String,
    },
    Error {
        message: String,
    },
}

/// A finished streamed answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub usage: TutorUsage,
    /// `end_turn`, `max_tokens`, `refusal`, ...
    pub stop_reason: String,
}

impl Completion {
    /// The safety filter declined to answer; the app shows its own message instead.
    pub fn is_refusal(&self) -> bool {
        self.stop_reason == "refusal"
    }
}

/// A successful key test.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyCheck {
    /// The model that answered, as the API reports it.
    pub model: String,
}

/// Result of `tutor_test_key` in the IPC contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyTestResult {
    pub ok: bool,
    pub model: String,
    pub message: String,
}
