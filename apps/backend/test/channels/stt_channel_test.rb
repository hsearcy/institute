require "test_helper"

class SttChannelTest < ActionCable::Channel::TestCase
  class FakeSession
    attr_reader :started, :closed, :sent_audio, :on_event
    def initialize(expected_answers:, &on_event)
      @expected_answers = expected_answers
      @on_event = on_event
      @sent_audio = []
    end
    def start; @started = true; self; end
    def send_audio(frame); @sent_audio << frame; end
    def close; @closed = true; end
    def fire_event(payload); @on_event&.call(payload); end
  end

  setup do
    @original_factory = SttChannel.session_factory
    SttChannel.session_factory = FakeSession
  end

  teardown do
    SttChannel.session_factory = @original_factory
  end

  test "subscribed: opens session with expected_answers and starts it" do
    subscribe(expected_answers: [2, 4, 6])
    assert subscription.confirmed?
    session = subscription.instance_variable_get(:@session)
    assert session.started
  end

  test "transmits events emitted by the session" do
    subscribe(expected_answers: [2, 4, 6])
    session = subscription.instance_variable_get(:@session)
    transmissions_before = transmissions.length
    session.fire_event(transcript: "four", normalized: 4, confidence: "high")
    assert_equal transmissions_before + 1, transmissions.length
    assert_equal({ "transcript" => "four", "normalized" => 4, "confidence" => "high" }, transmissions.last)
  end

  test "receive forwards binary audio to the session" do
    subscribe(expected_answers: [])
    subscription.receive("\x01\x02")
    session = subscription.instance_variable_get(:@session)
    assert_equal ["\x01\x02"], session.sent_audio
  end

  test "unsubscribed closes the session" do
    subscribe(expected_answers: [])
    session = subscription.instance_variable_get(:@session)
    unsubscribe
    assert session.closed
  end
end
