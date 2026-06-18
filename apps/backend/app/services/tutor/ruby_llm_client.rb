module Tutor
  # Thin adapter around the ruby_llm gem (1.14.x).
  #
  # Maps our (model:, messages:, response_schema:) interface onto RubyLLM's
  # Chat API:
  #   - RubyLLM.chat(model:)            → Chat instance
  #   - chat.with_instructions(text)    → injects/replaces the system message
  #   - chat.with_schema(json_schema)   → enables structured output (the gem
  #     normalizes the schema and providers translate to native JSON-Schema
  #     constrained output where supported, falling back to a system-prompt
  #     instruction otherwise)
  #   - chat.add_message(role:, content:) for the user message, then
  #   - chat.complete → response with parsed-Hash content (Chat#complete
  #     auto-JSON.parses content when a schema is set; see chat.rb).
  module RubyLLMClient
    module_function

    def chat(model:, messages:, response_schema:)
      chat = RubyLLM.chat(model: model)
      # Some sampling temperature so consecutive rounds for the same skill don't
      # come back byte-for-byte identical (variety in numbers/length/enemy/intro).
      chat.with_temperature(0.8) if chat.respond_to?(:with_temperature)

      system_msgs, other_msgs = messages.partition { |m| m[:role].to_s == "system" }
      system_msgs.each { |m| chat.with_instructions(m[:content], append: true) }

      chat.with_schema(response_schema)

      # Add user/assistant turns. We expect a single trailing user message,
      # but iterate so multi-turn callers work too. The final `complete` call
      # below sends the accumulated messages.
      other_msgs[0..-2].each do |m|
        chat.add_message(role: m[:role].to_sym, content: m[:content])
      end

      last = other_msgs.last
      response =
        if last && last[:role].to_s == "user"
          chat.ask(last[:content])
        else
          chat.add_message(role: last[:role].to_sym, content: last[:content]) if last
          chat.complete
        end

      content = response.content
      content = JSON.parse(content) if content.is_a?(String)
      { content: content }
    end
  end
end
