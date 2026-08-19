# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_14_231424) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "api_keys", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.string "name"
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["token"], name: "index_api_keys_on_token", unique: true
  end

  create_table "favorites", force: :cascade do |t|
    t.bigint "api_key_id", null: false
    t.datetime "created_at", null: false
    t.string "listing_id", null: false
    t.datetime "updated_at", null: false
    t.index ["api_key_id", "listing_id"], name: "index_favorites_on_api_key_id_and_listing_id", unique: true
    t.index ["api_key_id"], name: "index_favorites_on_api_key_id"
  end

  create_table "listings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.jsonb "data", default: {}, null: false
    t.string "district"
    t.float "lat"
    t.string "listing_id", null: false
    t.float "lng"
    t.string "op"
    t.integer "price_usd"
    t.datetime "updated_at", null: false
    t.index ["district"], name: "index_listings_on_district"
    t.index ["lat", "lng"], name: "index_listings_on_lat_and_lng"
    t.index ["listing_id"], name: "index_listings_on_listing_id"
    t.index ["op"], name: "index_listings_on_op"
    t.index ["price_usd"], name: "index_listings_on_price_usd"
  end

  add_foreign_key "favorites", "api_keys"
end
