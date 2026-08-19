class PingController < ApplicationController
  # GET /ping
  # Devuelve 200 solo si la API key enviada es válida.
  def show
    render json: {
      ok: true,
      message: "API key válida",
      key: current_api_key.name
    }
  end
end
