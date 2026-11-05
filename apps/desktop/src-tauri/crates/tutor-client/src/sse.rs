//! Incremental Server-Sent Events parser.
//!
//! Follows the WHATWG event-stream rules that matter for the Messages API:
//! lines end with LF, CRLF or a lone CR; `event:` sets the event name; `data:` lines are
//! joined with `\n`; one optional space after the colon is stripped; lines starting with
//! `:` are comments; an empty line dispatches the event. Bytes are buffered until a whole
//! line has arrived, so chunks may split anywhere, including inside a multi-byte UTF-8
//! character or between the CR and LF of a CRLF pair.

/// One dispatched event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    /// The `event:` field, or `"message"` when the event had none.
    pub event: String,
    /// The `data:` lines joined with `\n`.
    pub data: String,
}

/// Feed it chunks as they arrive; it returns the events completed by each chunk.
#[derive(Debug, Default)]
pub struct SseParser {
    /// Bytes of the current, not yet terminated line.
    line: Vec<u8>,
    /// The previous chunk ended with CR; a leading LF in the next chunk belongs to it.
    pending_cr: bool,
    event: Option<String>,
    data: Option<String>,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Consumes a chunk and returns every event it completed, in order.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<SseEvent> {
        let mut events = Vec::new();
        let mut bytes = chunk;
        if self.pending_cr {
            self.pending_cr = false;
            if let Some((&b'\n', rest)) = bytes.split_first() {
                bytes = rest;
            }
        }
        let mut i = 0;
        while i < bytes.len() {
            match bytes[i] {
                b'\n' => {
                    self.end_line(&mut events);
                }
                b'\r' => {
                    self.end_line(&mut events);
                    match bytes.get(i + 1) {
                        Some(b'\n') => i += 1,
                        Some(_) => {}
                        None => self.pending_cr = true,
                    }
                }
                byte => self.line.push(byte),
            }
            i += 1;
        }
        events
    }

    /// Call when the stream has ended. Unlike the browser algorithm, which drops an
    /// unterminated event, this dispatches it if it carries data: a server that closes the
    /// connection right after its last `data:` line has still said what it meant.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let mut events = Vec::new();
        self.pending_cr = false;
        if !self.line.is_empty() {
            self.end_line(&mut events);
        }
        self.dispatch(&mut events);
        events
    }

    fn end_line(&mut self, events: &mut Vec<SseEvent>) {
        let line = std::mem::take(&mut self.line);
        if line.is_empty() {
            self.dispatch(events);
            return;
        }
        let line = String::from_utf8_lossy(&line);
        if line.starts_with(':') {
            return;
        }
        let (field, value) = match line.find(':') {
            Some(at) => {
                let value = &line[at + 1..];
                (&line[..at], value.strip_prefix(' ').unwrap_or(value))
            }
            None => (&line[..], ""),
        };
        match field {
            "event" => self.event = Some(value.to_owned()),
            "data" => match &mut self.data {
                Some(data) => {
                    data.push('\n');
                    data.push_str(value);
                }
                None => self.data = Some(value.to_owned()),
            },
            // `id` and `retry` steer browser reconnection, which this client does not do.
            _ => {}
        }
    }

    fn dispatch(&mut self, events: &mut Vec<SseEvent>) {
        let event = self.event.take();
        if let Some(data) = self.data.take() {
            events.push(SseEvent {
                event: event
                    .filter(|name| !name.is_empty())
                    .unwrap_or_else(|| "message".to_owned()),
                data,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_all(chunks: &[&[u8]]) -> Vec<SseEvent> {
        let mut parser = SseParser::new();
        let mut events = Vec::new();
        for chunk in chunks {
            events.extend(parser.feed(chunk));
        }
        events.extend(parser.finish());
        events
    }

    fn ev(event: &str, data: &str) -> SseEvent {
        SseEvent {
            event: event.to_owned(),
            data: data.to_owned(),
        }
    }

    #[test]
    fn parses_named_events() {
        let events = parse_all(&[b"event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"]);
        assert_eq!(events, vec![ev("a", "1"), ev("b", "2")]);
    }

    #[test]
    fn defaults_event_name_to_message() {
        assert_eq!(parse_all(&[b"data: x\n\n"]), vec![ev("message", "x")]);
    }

    #[test]
    fn joins_multiple_data_lines() {
        let events = parse_all(&[b"data: first\ndata:second\ndata\n\n"]);
        assert_eq!(events, vec![ev("message", "first\nsecond\n")]);
    }

    #[test]
    fn strips_only_one_leading_space() {
        assert_eq!(parse_all(&[b"data:  two\n\n"]), vec![ev("message", " two")]);
    }

    #[test]
    fn ignores_comments_unknown_fields_and_empty_events() {
        let events = parse_all(&[b": keep-alive\nid: 7\nretry: 100\n\nevent: x\n\ndata: y\n\n"]);
        assert_eq!(events, vec![ev("message", "y")]);
    }

    #[test]
    fn handles_crlf_and_lone_cr() {
        assert_eq!(
            parse_all(&[b"event: a\r\ndata: 1\r\n\r\nevent: b\rdata: 2\r\r"]),
            vec![ev("a", "1"), ev("b", "2")]
        );
    }

    #[test]
    fn crlf_split_across_chunks_is_one_line_break() {
        let events = parse_all(&[b"data: 1\r", b"\n", b"\r", b"\ndata: 2\r\n\r\n"]);
        assert_eq!(events, vec![ev("message", "1"), ev("message", "2")]);
    }

    #[test]
    fn utf8_split_inside_a_character() {
        let text = "data: åäö §\n\n".as_bytes();
        // 'å' is two bytes; split between them.
        let split = text.iter().position(|&b| b == 0xC3).unwrap() + 1;
        let events = parse_all(&[&text[..split], &text[split..]]);
        assert_eq!(events, vec![ev("message", "åäö §")]);
    }

    #[test]
    fn every_split_point_gives_the_same_events() {
        let input = b"event: a\r\ndata: {\"t\":\"\xc3\xa5\"}\r\n\r\n: c\nevent: b\ndata: 2\n\n";
        let expected = parse_all(&[input]);
        assert_eq!(expected.len(), 2);
        for split in 0..=input.len() {
            assert_eq!(
                parse_all(&[&input[..split], &input[split..]]),
                expected,
                "split at {split}"
            );
        }
        let bytes: Vec<&[u8]> = input.chunks(1).collect();
        assert_eq!(parse_all(&bytes), expected);
    }

    #[test]
    fn finish_dispatches_unterminated_event() {
        assert_eq!(parse_all(&[b"event: a\ndata: 1"]), vec![ev("a", "1")]);
        assert_eq!(parse_all(&[b"event: a\n"]), vec![]);
    }
}
