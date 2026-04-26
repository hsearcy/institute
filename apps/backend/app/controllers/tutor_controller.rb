class TutorController < ApplicationController
  skip_before_action :verify_authenticity_token, raise: false
  before_action :authenticate_bearer!

  REQUIRED_KEYS = %w[profile currentZone eligiblePool recentHistory availablePlugins].freeze

  class << self
    attr_accessor :picker
  end
  self.picker = Tutor::Picker

  def next_round
    payload = request.request_parameters
    missing = REQUIRED_KEYS - payload.keys
    if missing.any?
      return render json: { error: "missing keys: #{missing.join(', ')}" }, status: :unprocessable_entity
    end

    result = self.class.picker.call(payload)
    render json: result, status: :ok
  rescue Tutor::Picker::NoEligibleContent => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue Tutor::Picker::InvalidResponse => e
    Rails.logger.warn("Tutor::Picker invalid response: #{e.message}")
    render json: { error: "llm response failed validation" }, status: :bad_gateway
  rescue => e
    Rails.logger.error("TutorController error: #{e.class} #{e.message}\n#{e.backtrace.first(10).join("\n")}")
    render json: { error: "internal error" }, status: :internal_server_error
  end

  private

  def authenticate_bearer!
    secret = ENV["TUTOR_SHARED_SECRET"]
    return if secret.nil? || secret.empty?

    header = request.headers["Authorization"].to_s
    expected = "Bearer #{secret}"
    return if ActiveSupport::SecurityUtils.secure_compare(header, expected)

    render json: { error: "unauthorized" }, status: :unauthorized
  end
end
