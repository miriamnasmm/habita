class Favorite < ApplicationRecord
  belongs_to :api_key

  validates :listing_id, presence: true,
                         uniqueness: { scope: :api_key_id }
end
