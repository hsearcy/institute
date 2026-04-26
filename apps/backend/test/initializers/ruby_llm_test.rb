require "test_helper"

class RubyLLMConfigTest < ActiveSupport::TestCase
  test "RubyLLM is loaded" do
    assert defined?(RubyLLM), "RubyLLM should be loaded"
  end

  test "anthropic_api_key reads from ENV" do
    assert_nothing_raised do
      RubyLLM.config.anthropic_api_key
    end
  end
end
