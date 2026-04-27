class SttController < ApplicationController
  skip_before_action :verify_authenticity_token, raise: false
  before_action :authenticate_bearer!

  REQUIRED_KEYS = %w[audio expected_answers].freeze

  class << self
    attr_accessor :pre_recorded, :normalizer
  end
  self.pre_recorded = Stt::PreRecorded
  self.normalizer   = Tutor::SpeechNormalizer

  def create
    audio_param = params[:audio]
    if audio_param.blank?
      return render json: { error: "missing audio" }, status: :unprocessable_entity
    end

    expected = parse_expected(params[:expected_answers])

    audio_bytes  = audio_param.respond_to?(:read) ? audio_param.read : audio_param.to_s
    content_type = audio_param.respond_to?(:content_type) ? audio_param.content_type : "audio/m4a"
    content_type = "audio/m4a" if content_type.blank?

    transcript = self.class.pre_recorded.transcribe(audio_bytes: audio_bytes, content_type: content_type)
    result = self.class.normalizer.call(transcript, expected)
    render json: result, status: :ok
  rescue Stt::PreRecorded::StreamError => e
    Rails.logger.warn("Stt::PreRecorded error: #{e.message}")
    render json: { error: "stt provider failed" }, status: :bad_gateway
  rescue => e
    Rails.logger.error("SttController error: #{e.class} #{e.message}\n#{e.backtrace.first(10).join("\n")}")
    render json: { error: "internal error" }, status: :internal_server_error
  end

  private

  def parse_expected(raw)
    case raw
    when Array then raw.map(&:to_i)
    when String then raw.split(",").map(&:to_i)
    else []
    end
  end

  def authenticate_bearer!
    secret = ENV["TUTOR_SHARED_SECRET"]
    return if secret.nil? || secret.empty?
    header = request.headers["Authorization"].to_s
    return if ActiveSupport::SecurityUtils.secure_compare(header, "Bearer #{secret}")
    render json: { error: "unauthorized" }, status: :unauthorized
  end
end
