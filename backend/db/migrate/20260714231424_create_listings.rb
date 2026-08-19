class CreateListings < ActiveRecord::Migration[8.1]
  def change
    create_table :listings do |t|
      t.string  :listing_id, null: false
      t.string  :op
      t.string  :district
      t.float   :lat
      t.float   :lng
      t.integer :price_usd
      t.jsonb   :data, null: false, default: {}

      t.timestamps
    end
    add_index :listings, :listing_id
    add_index :listings, :op
    add_index :listings, :district
    add_index :listings, [:lat, :lng]
    add_index :listings, :price_usd
  end
end
