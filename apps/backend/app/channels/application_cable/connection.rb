module ApplicationCable
  class Connection < ActionCable::Connection::Base
    # Bearer auth — same shared secret as TutorController. When
    # TUTOR_SHARED_SECRET is unset (dev convenience), allow all.
    def connect
      secret = ENV["TUTOR_SHARED_SECRET"]
      return if secret.nil? || secret.empty?
      header = request.headers["Authorization"].to_s
      reject_unauthorized_connection unless ActiveSupport::SecurityUtils.secure_compare(header, "Bearer #{secret}")
    end
  end
end
