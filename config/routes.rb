Rails.application.routes.draw do
  resources :rooms
  # For details on the DSL available within this file, see https://guides.rubyonrails.org/routing.html
  mount ActionCable.server, at: '/cable'
end
