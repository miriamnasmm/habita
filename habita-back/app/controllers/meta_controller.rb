class MetaController < ApplicationController
  # Público, igual que listings: el front lo pide antes de montar la app.
  skip_before_action :authenticate_api_key!

  # GET /meta.json
  # Resumen que el front necesita para arrancar (lo consume main.jsx y
  # lo lee habita.js como MAP_DATA.districts / .active_districts / .rent_counts).
  #
  # La geografía de los distritos (nombre, bbox, centro, zoom) es fija y vive
  # en config/districts.json. Los conteos se calculan desde la tabla listings,
  # así que siempre reflejan lo que hay en la base de datos.
  def show
    config = self.class.districts_config

    render json: {
      districts:        config["districts"],
      score_range:      config["score_range"],
      active_districts: active_districts,
      rent_counts:      counts_for("alquiler"),
      sale_counts:      counts_for("venta"),
      rent_total:       Listing.where(op: "alquiler").count,
      generated_at:     Listing.maximum(:updated_at)&.iso8601
    }
  end

  # Se lee del disco una sola vez y se guarda en memoria (no cambia en runtime).
  def self.districts_config
    @districts_config ||= JSON.parse(Rails.root.join("config", "districts.json").read)
  end

  private

  # Distritos que hoy tienen al menos una propiedad, en el orden de districts.json.
  def active_districts
    con_datos = Listing.distinct.pluck(:district).compact.to_set
    self.class.districts_config["districts"].keys.select { |id| con_datos.include?(id) }
  end

  # {"pueblo-libre" => 101, ...} para la operación pedida.
  def counts_for(op)
    Listing.where(op: op).group(:district).count
  end
end
