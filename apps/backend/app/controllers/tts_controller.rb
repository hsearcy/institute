class TtsController < ApplicationController
  include ActionController::Live
  skip_before_action :verify_authenticity_token, raise: false
  before_action :authenticate_bearer!

  class << self
    attr_accessor :tts_stream
  end
  self.tts_stream = Tts::Stream

  def create
    text = params[:text].to_s
    if text.empty?
      return render json: { error: "missing text" }, status: :unprocessable_entity
    end
    voice_id = params[:voiceId].presence

    response.headers["Content-Type"] = "audio/mpeg"
    response.headers["Cache-Control"] = "no-cache"

    begin
      if voice_id
        self.class.tts_stream.call(text: text, voice_id: voice_id) { |c| response.stream.write(c) }
      else
        self.class.tts_stream.call(text: text) { |c| response.stream.write(c) }
      end
    rescue Tts::Stream::StreamError => e
      Rails.logger.warn("Tts::Stream error: #{e.message}")
      response.stream.close unless response.stream.closed?
      self.response.status = 502
    rescue => e
      Rails.logger.error("TtsController error: #{e.class} #{e.message}")
      self.response.status = 500 unless response.committed?
    ensure
      response.stream.close unless response.stream.closed?
    end
  end

  private

  def authenticate_bearer!
    secret = ENV["TUTOR_SHARED_SECRET"]
    return if secret.nil? || secret.empty?
    header = request.headers["Authorization"].to_s
    return if ActiveSupport::SecurityUtils.secure_compare(header, "Bearer #{secret}")
    render json: { error: "unauthorized" }, status: :unauthorized
  end
end
