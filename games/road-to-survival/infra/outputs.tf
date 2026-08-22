output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "container_registry_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "container_app_fqdn" {
  description = "Server's public hostname. Build the client with VITE_SERVER_URL=wss://<this value> (wss, not ws -- see design.md)."
  value       = azurerm_container_app.server.ingress[0].fqdn
}

output "static_web_app_default_hostname" {
  value = azurerm_static_web_app.client.default_host_name
}

output "static_web_app_api_key" {
  description = "Deployment token for `swa deploy` / az staticwebapp CLI publishing."
  value       = azurerm_static_web_app.client.api_key
  sensitive   = true
}
