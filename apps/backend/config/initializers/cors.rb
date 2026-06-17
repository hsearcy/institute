# Allow the Expo Web dev build (localhost:8081) to call the tutor/TTS/STT
# endpoints cross-origin. Native (tablet) builds don't go through browser CORS,
# so this only matters for the web dev loop. Dev-only origins.
if Rails.env.development?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins "http://localhost:8081", "http://127.0.0.1:8081", %r{\Ahttp://localhost:\d+\z}
      resource "*",
        headers: :any,
        methods: %i[get post put patch delete options head],
        expose: %w[Content-Type Content-Length],
        max_age: 600
    end
  end
end
