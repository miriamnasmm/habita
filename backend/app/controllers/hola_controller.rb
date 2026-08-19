class HolaController < ApplicationController
  skip_before_action :authenticate_api_key!

  def show
    render json: { mensaje: "Hola, Miriamna 👋", desde: "backend en cuy 🐹" }
  end
end
