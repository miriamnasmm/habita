class ApiKey < ApplicationRecord
  has_many :favorites, dependent: :destroy

  before_validation :generate_token, on: :create

  validates :token, presence: true, uniqueness: true

  scope :active, -> { where(active: true) }

  private

  def generate_token
    return if token.present?

    loop do
      self.token = SecureRandom.hex(32)
      break unless ApiKey.exists?(token: token)
    end
  end
end
