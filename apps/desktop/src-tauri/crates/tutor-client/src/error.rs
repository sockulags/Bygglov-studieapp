//! Errors with Swedish messages that the app can show as they are.

use serde::Deserialize;

/// Everything that can go wrong when asking the tutor. `Display` is the user-facing text.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TutorError {
    /// The request was rejected before it was sent (empty question, bad parameters).
    #[error("Frågan kunde inte skickas: {0}")]
    InvalidRequest(String),

    /// HTTP 401 / `authentication_error`.
    #[error(
        "API-nyckeln godtogs inte av Anthropic. Kontrollera att hela nyckeln är inklistrad under \
         Inställningar → Studiehjälp, eller be om en ny nyckel."
    )]
    InvalidKey,

    /// HTTP 403 / `permission_error`.
    #[error(
        "Nyckeln saknar behörighet för det här anropet. Kontrollera nyckelns workspace i \
         Anthropic Console."
    )]
    PermissionDenied,

    /// HTTP 402 / `billing_error`, or a 400 saying the credit balance is too low.
    #[error(
        "Det finns ingen kredit kvar på API-kontot, eller så är månadstaket nått. Den som \
         administrerar nyckeln behöver fylla på eller höja taket i Anthropic Console."
    )]
    OutOfCredit,

    /// HTTP 429 / `rate_limit_error`.
    #[error("{}", rate_limited_message(*retry_after_secs))]
    RateLimited { retry_after_secs: Option<u64> },

    /// HTTP 529 / `overloaded_error`.
    #[error("Anthropics tjänst är överbelastad just nu. Vänta en stund och försök igen.")]
    Overloaded,

    /// HTTP 404 / `not_found_error`: usually an unknown or unavailable model.
    #[error(
        "Modellen hittades inte eller är inte tillgänglig för den här nyckeln. Välj en annan \
         modell under Inställningar → Studiehjälp."
    )]
    ModelNotFound,

    /// HTTP 5xx other than 529, or `api_error`.
    #[error("Anthropics tjänst svarade med ett fel (HTTP {status}). Försök igen om en stund.")]
    Server { status: u16 },

    /// Other 4xx: the API's own (English) explanation is kept for troubleshooting.
    #[error("Anropet avvisades av Anthropic: {0}")]
    Rejected(String),

    /// The connection could not be made (offline, DNS, TLS, proxy).
    #[error("Kunde inte nå Anthropic. Kontrollera internetanslutningen och försök igen.")]
    Network { detail: String },

    /// No answer within the client's time limits.
    #[error("Anthropic svarade inte i tid. Kontrollera internetanslutningen och försök igen.")]
    Timeout,

    /// The stream ended before the answer was complete.
    #[error("Anslutningen bröts innan svaret var klart. Försök igen.")]
    Interrupted,

    /// The response did not look like the Messages API.
    #[error("Oväntat svar från Anthropic: {0}")]
    Protocol(String),
}

fn rate_limited_message(retry_after_secs: Option<u64>) -> String {
    let wait = match retry_after_secs {
        Some(0) | None => "om en stund".to_owned(),
        Some(1) => "om en sekund".to_owned(),
        Some(secs) if secs < 120 => format!("om {secs} sekunder"),
        Some(secs) => format!("om ungefär {} minuter", secs.div_ceil(60)),
    };
    format!(
        "Gränsen för hur mycket nyckeln får användas är nådd just nu. Försök igen {wait}. \
         Fortsätter det kan krediten eller månadstaket i Anthropic Console vara slut."
    )
}

impl TutorError {
    /// Errors that are worth retrying automatically before any text has been streamed.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            TutorError::Overloaded | TutorError::Server { .. } | TutorError::Network { .. }
        )
    }
}

#[derive(Deserialize)]
struct ErrorEnvelope {
    error: ApiErrorBody,
}

/// The `error` object of an error response or an `error` stream event.
#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct ApiErrorBody {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub message: String,
}

/// Maps a non-200 HTTP response to an error.
pub fn classify_http_error(status: u16, retry_after: Option<&str>, body: &str) -> TutorError {
    let api = serde_json::from_str::<ErrorEnvelope>(body)
        .map(|envelope| envelope.error)
        .unwrap_or_default();
    match status {
        401 => TutorError::InvalidKey,
        402 => TutorError::OutOfCredit,
        403 => TutorError::PermissionDenied,
        404 => TutorError::ModelNotFound,
        429 => TutorError::RateLimited {
            retry_after_secs: retry_after.and_then(parse_retry_after),
        },
        529 => TutorError::Overloaded,
        500..=599 => match api.kind.as_str() {
            "overloaded_error" => TutorError::Overloaded,
            _ => TutorError::Server { status },
        },
        400..=499 => classify_api_error(&api.kind, &api.message)
            .unwrap_or_else(|| rejected(&api.message, status)),
        _ => TutorError::Protocol(format!("HTTP {status}")),
    }
}

/// Maps the `error` object of a stream `error` event (or an error body) by its type.
/// Returns `None` for `invalid_request_error` and unknown types that carry no better
/// meaning than their message.
pub(crate) fn classify_api_error(kind: &str, message: &str) -> Option<TutorError> {
    if message.to_ascii_lowercase().contains("credit balance") {
        return Some(TutorError::OutOfCredit);
    }
    Some(match kind {
        "authentication_error" => TutorError::InvalidKey,
        "permission_error" => TutorError::PermissionDenied,
        "billing_error" => TutorError::OutOfCredit,
        "not_found_error" => TutorError::ModelNotFound,
        "rate_limit_error" => TutorError::RateLimited {
            retry_after_secs: None,
        },
        "overloaded_error" => TutorError::Overloaded,
        "api_error" => TutorError::Server { status: 500 },
        _ => return None,
    })
}

pub(crate) fn rejected(message: &str, status: u16) -> TutorError {
    if message.trim().is_empty() {
        TutorError::Rejected(format!("HTTP {status}"))
    } else {
        TutorError::Rejected(message.trim().to_owned())
    }
}

/// `retry-after` in seconds (integer or decimal). HTTP dates are not used by the API.
fn parse_retry_after(value: &str) -> Option<u64> {
    let secs: f64 = value.trim().parse().ok()?;
    (secs.is_finite() && secs >= 0.0).then(|| secs.ceil() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_after_parsing() {
        assert_eq!(parse_retry_after("17"), Some(17));
        assert_eq!(parse_retry_after(" 1.2 "), Some(2));
        assert_eq!(parse_retry_after("Wed, 21 Oct 2026 07:28:00 GMT"), None);
        assert_eq!(parse_retry_after("-3"), None);
    }

    #[test]
    fn rate_limit_message_mentions_wait() {
        let msg = TutorError::RateLimited {
            retry_after_secs: Some(17),
        }
        .to_string();
        assert!(msg.contains("om 17 sekunder"), "{msg}");
        let msg = TutorError::RateLimited {
            retry_after_secs: Some(600),
        }
        .to_string();
        assert!(msg.contains("om ungefär 10 minuter"), "{msg}");
        let msg = TutorError::RateLimited {
            retry_after_secs: None,
        }
        .to_string();
        assert!(msg.contains("om en stund"), "{msg}");
    }

    #[test]
    fn status_classification() {
        assert_eq!(classify_http_error(401, None, ""), TutorError::InvalidKey);
        assert_eq!(
            classify_http_error(529, None, "not json"),
            TutorError::Overloaded
        );
        assert_eq!(
            classify_http_error(503, None, ""),
            TutorError::Server { status: 503 }
        );
        assert_eq!(
            classify_http_error(
                400,
                None,
                r#"{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}"#
            ),
            TutorError::OutOfCredit
        );
        assert_eq!(
            classify_http_error(
                400,
                None,
                r#"{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: too large"}}"#
            ),
            TutorError::Rejected("max_tokens: too large".into())
        );
        assert_eq!(
            classify_http_error(418, None, ""),
            TutorError::Rejected("HTTP 418".into())
        );
    }
}
