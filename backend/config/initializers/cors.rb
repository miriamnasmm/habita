# Be sure to restart your server when you modify this file.

# Permite que la página web (en otro dominio) llame a esta API desde el navegador.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "http://localhost:5173",              # frontend en desarrollo (vite)
            "http://localhost:4173",              # vite preview
            "https://miriamnasmm.github.io",      # frontend en GitHub Pages
            "https://habita.homes",               # frontend en el dominio propio
            "https://www.habita.homes"

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
