//! Tauri commands for the study assistant ("Studiehjälp").
//!
//! The Anthropic API key is kept in the operating system's credential store (Windows
//! Credential Manager) and never crosses into the web view: the web view sends the prompt,
//! this module adds the key, calls the API through `tutor-client` and streams the answer
//! back over a `tauri::ipc::Channel`.
//!
//! IPC contract (see docs/05-teknik.md, "Studiehjälp med AI"):
//! - `tutor_has_key() -> boolean`
//! - `tutor_set_key(key: string) -> void`
//! - `tutor_clear_key() -> void`
//! - `tutor_test_key(model: string) -> { ok, model, message }`
//! - `tutor_ask(request: TutorRequest, onEvent: Channel<TutorEvent>) -> TutorUsage`
//!
//! Errors reach JavaScript as rejected promises carrying a Swedish message string.

use tauri::ipc::Channel;
use tutor_client::{KeyTestResult, TutorEvent, TutorRequest, TutorUsage};

/// Credential store entry: Windows shows it as `anthropic-api-key@se.bygglovstudieapp.app`.
const KEYRING_SERVICE: &str = "se.bygglovstudieapp.app";
const KEYRING_USER: &str = "anthropic-api-key";
const KEY_PREFIX: &str = "sk-ant-";

const NO_KEY: &str =
    "Ingen API-nyckel är sparad. Klistra in nyckeln under Inställningar → Studiehjälp.";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(store_error)
}

fn store_error(error: keyring::Error) -> String {
    format!("Kunde inte komma åt nyckellagret i Windows (Autentiseringshanteraren): {error}")
}

fn read_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(store_error(error)),
    }
}

/// Reads the key on the blocking pool so the async runtime is not held up by the OS call.
async fn require_key() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(read_key)
        .await
        .map_err(|error| error.to_string())??
        .ok_or_else(|| NO_KEY.to_owned())
}

/// Trims what was pasted and checks that it looks like an Anthropic API key.
fn normalize_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if !key.starts_with(KEY_PREFIX) {
        return Err(format!(
            "Det här ser inte ut som en API-nyckel från Anthropic. En nyckel börjar med \
             {KEY_PREFIX} och skapas i Anthropic Console."
        ));
    }
    if key.len() <= KEY_PREFIX.len() || key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(
            "Nyckeln innehåller mellanslag eller radbrytningar. Kopiera den igen i ett stycke."
                .to_owned(),
        );
    }
    Ok(key)
}

/// Whether a key is stored. Never returns the key itself.
#[tauri::command]
pub fn tutor_has_key() -> Result<bool, String> {
    read_key().map(|key| key.is_some())
}

/// Stores the key in the credential store, replacing any earlier key.
#[tauri::command]
pub fn tutor_set_key(key: String) -> Result<(), String> {
    let key = normalize_key(&key)?;
    entry()?.set_password(key).map_err(store_error)
}

/// Removes the stored key. Removing a key that is not there is not an error.
#[tauri::command]
pub fn tutor_clear_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(store_error(error)),
    }
}

/// Makes a minimal call with the stored key. API failures are reported in the result
/// (`ok: false`) rather than as a rejected promise, so the settings page can show them.
#[tauri::command]
pub async fn tutor_test_key(model: String) -> Result<KeyTestResult, String> {
    let key = match require_key().await {
        Ok(key) => key,
        Err(message) => {
            return Ok(KeyTestResult {
                ok: false,
                model,
                message,
            })
        }
    };
    Ok(match tutor_client::test_key(&key, &model).await {
        Ok(check) => KeyTestResult {
            ok: true,
            message: format!("Nyckeln fungerar. Modellen {} svarade.", check.model),
            model: check.model,
        },
        Err(error) => KeyTestResult {
            ok: false,
            model,
            message: error.to_string(),
        },
    })
}

/// Streams an answer: `text` events while it is written, then exactly one `done` or
/// `error` event. The promise resolves with the usage after `done`, or rejects with the
/// same message as the `error` event. A `done` with `stopReason: "refusal"` means the
/// safety filter declined; the web view shows its own message for that.
#[tauri::command]
pub async fn tutor_ask(
    request: TutorRequest,
    on_event: Channel<TutorEvent>,
) -> Result<TutorUsage, String> {
    let result = match require_key().await {
        Ok(key) => tutor_client::stream_message(&key, &request, |text| {
            // A closed window only means nobody is listening any more.
            let _ = on_event.send(TutorEvent::Text { text });
        })
        .await
        .map_err(|error| error.to_string()),
        Err(message) => Err(message),
    };
    match result {
        Ok(completion) => {
            let _ = on_event.send(TutorEvent::Done {
                usage: completion.usage.clone(),
                stop_reason: completion.stop_reason,
            });
            Ok(completion.usage)
        }
        Err(message) => {
            let _ = on_event.send(TutorEvent::Error {
                message: message.clone(),
            });
            Err(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_key;

    #[test]
    fn key_validation() {
        assert_eq!(
            normalize_key("  sk-ant-api03-abc\n"),
            Ok("sk-ant-api03-abc")
        );
        assert!(normalize_key("sk-proj-abc").is_err());
        assert!(normalize_key("sk-ant-").is_err());
        assert!(normalize_key("sk-ant-api03 abc").is_err());
        assert!(normalize_key("").is_err());
    }
}
