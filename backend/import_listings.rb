require "json"

def load_listings(path)
  raw = File.read(path).strip
  raw = raw.sub(/\Awindow\.\w+\s*=\s*/, "").sub(/;\s*\z/, "")
  JSON.parse(raw)["listings"]
end

Listing.delete_all
now = Time.current
total = 0

{ "venta" => "map_data.js", "alquiler" => "map_data_rent.js" }.each do |op_label, file|
  # Los datos originales viven en el front (monorepo): frontend/public/
  listings = load_listings(Rails.root.join("..", "frontend", "public", file))
  rows = listings.map do |r|
    {
      listing_id: r["id"],
      op:         r["op"] || op_label,
      district:   r["district"],
      lat:        r["lat"],
      lng:        r["lng"],
      price_usd:  r["price_usd"],
      data:       r,
      created_at: now,
      updated_at: now
    }
  end
  rows.each_slice(1000) { |batch| Listing.insert_all(batch) }
  puts "  #{file}: #{rows.size} importadas"
  total += rows.size
end

puts "TOTAL insertadas: #{total}"
puts "En la base de datos: #{Listing.count}"
