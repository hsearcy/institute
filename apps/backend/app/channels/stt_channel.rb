class SttChannel < ApplicationCable::Channel
  class << self
    attr_accessor :session_factory
  end
  self.session_factory = Stt::DeepgramSession

  def subscribed
    expected = Array(params[:expected_answers]).map(&:to_i)
    @session = self.class.session_factory.new(expected_answers: expected) do |event|
      transmit(event)
    end
    @session.start
  end

  def unsubscribed
    @session&.close
  end

  # Binary audio frames from the client land here.
  def receive(data)
    @session&.send_audio(data)
  end
end
