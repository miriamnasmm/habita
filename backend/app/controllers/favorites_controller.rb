class FavoritesController < ApplicationController
  # GET /favorites
  # Devuelve la lista de IDs de departamentos guardados.
  def index
    ids = current_api_key.favorites.pluck(:listing_id)
    render json: { favorites: ids }
  end

  # POST /favorites  { "listing_id": "148086599" }
  # Guarda un departamento como favorito.
  def create
    fav = current_api_key.favorites.find_or_create_by(listing_id: params[:listing_id])

    if fav.persisted?
      render json: { ok: true, listing_id: fav.listing_id }, status: :created
    else
      render json: { error: fav.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # DELETE /favorites/:listing_id
  # Quita un departamento de favoritos.
  def destroy
    current_api_key.favorites.where(listing_id: params[:listing_id]).destroy_all
    render json: { ok: true, listing_id: params[:listing_id] }
  end
end
