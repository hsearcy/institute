require "test_helper"
require "ostruct"

class Stt::DeepgramSessionTest < ActiveSupport::TestCase
  class StubWs
    attr_reader :sent
    attr_accessor :on_open, :on_message, :on_close, :closed

    def initialize
      @sent = []
      @closed = false
    end

    def send(frame)
      @sent << frame
    end

    def on(event, &blk)
      case event
      when :open    then @on_open    = blk
      when :message then @on_message = blk
      when :close   then @on_close   = blk
      end
    end

    def close
      @closed = true
      @on_close&.call(OpenStruct.new(code: 1000, reason: "test"))
    end

    def fire_open;             @on_open&.call(nil); end
    def fire_message(payload); @on_message&.call(OpenStruct.new(data: payload)); end
  end

  test "send_audio forwards binary frames to the WS once open" do
    ws = StubWs.new
    session = Stt::DeepgramSession.new(expected_answers: [2, 4, 6], ws: ws) {}
    session.start
    ws.fire_open
    session.send_audio("\x01\x02")
    session.send_audio("\x03")
    assert_equal ["\x01\x02", "\x03"], ws.sent
  end

  test "buffers audio sent before open and flushes on open" do
    ws = StubWs.new
    session = Stt::DeepgramSession.new(expected_answers: [], ws: ws) {}
    session.start
    session.send_audio("a")
    session.send_audio("b")
    assert_empty ws.sent, "should buffer until open"
    ws.fire_open
    assert_equal ["a", "b"], ws.sent
  end

  test "emits normalized event on Deepgram speech_final message" do
    ws = StubWs.new
    events = []
    session = Stt::DeepgramSession.new(expected_answers: [2, 4, 6], ws: ws) { |e| events << e }
    session.start
    ws.fire_open
    msg = { is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "four" }] } }.to_json
    ws.fire_message(msg)
    assert_equal 1, events.size
    assert_equal "four", events[0][:transcript]
    assert_equal 4,      events[0][:normalized]
    assert_equal "high", events[0][:confidence]
  end

  test "ignores interim (non-final) Deepgram messages" do
    ws = StubWs.new
    events = []
    session = Stt::DeepgramSession.new(expected_answers: [], ws: ws) { |e| events << e }
    session.start
    ws.fire_open
    interim = { is_final: false, channel: { alternatives: [{ transcript: "fo" }] } }.to_json
    ws.fire_message(interim)
    assert_empty events
  end

  test "ignores empty transcripts" do
    ws = StubWs.new
    events = []
    session = Stt::DeepgramSession.new(expected_answers: [], ws: ws) { |e| events << e }
    session.start
    ws.fire_open
    ws.fire_message({ is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "" }] } }.to_json)
    assert_empty events
  end

  test "close terminates the WS" do
    ws = StubWs.new
    session = Stt::DeepgramSession.new(expected_answers: [], ws: ws) {}
    session.start
    session.close
    assert ws.closed
  end
end
