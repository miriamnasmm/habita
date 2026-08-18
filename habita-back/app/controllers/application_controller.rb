class ApplicationController < ActionController::API
  before_action :authenticate_api_key!

  attr_reader :current_api_key

  private

  # Cada pedido debe traer la API key en el header "X-Api-Key"
  # (o como "Authorization: Bearer <token>"). Si no es válida, se rechaza.
  def authenticate_api_key!
    token = request.headers["X-Api-Key"].presence ||
            request.headers["Authorization"].to_s.delete_prefix("Bearer ").strip.presence

    @current_api_key = ApiKey.active.find_by(token: token) if token

    unless @current_api_key
      render json: { error: "API key inválida o faltante" }, status: :unauthorized
    end
  end
end
