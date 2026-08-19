class ListingsController < ApplicationController
  skip_before_action :authenticate_api_key!

  # GET /listings?op=venta&district=pueblo-libre&bbox=minLat,minLng,maxLat,maxLng&limit=100
  def index
    scope = Listing.all
    scope = scope.where(op: params[:op])             if params[:op].present?
    scope = scope.where(district: params[:district]) if params[:district].present?

    if params[:bbox].present?
      min_lat, min_lng, max_lat, max_lng = params[:bbox].split(",").map(&:to_f)
      scope = scope.where(lat: min_lat..max_lat, lng: min_lng..max_lng)
    end

    scope = scope.limit(params[:limit].to_i) if params[:limit].present?

    listings = scope.pluck(:data).map { |d| slim(d) }
    render json: { count: listings.size, listings: listings }
  end

  # GET /listings/:id   -> propiedad completa
  def show
    listing = Listing.find_by(listing_id: params[:id])
    return render(json: { error: "no encontrada" }, status: :not_found) unless listing
    render json: listing.data
  end

  private

  # Versión ligera: la propiedad completa MENOS lo pesado (descripción, evidencia),
  # y con solo 1 foto (el detalle trae todas).
  def slim(data)
    data.except("description_jsonld", "floors")
  end
end
