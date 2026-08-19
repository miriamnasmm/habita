class CreateFavorites < ActiveRecord::Migration[8.1]
  def change
    create_table :favorites do |t|
      t.string :listing_id, null: false
      t.references :api_key, null: false, foreign_key: true

      t.timestamps
    end
    add_index :favorites, [:api_key_id, :listing_id], unique: true
  end
end
