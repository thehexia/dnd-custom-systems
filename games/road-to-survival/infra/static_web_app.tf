resource "azurerm_static_web_app" "client" {
  name                = "${var.name_prefix}-client"
  resource_group_name = azurerm_resource_group.this.name
  location            = var.static_web_app_location
  sku_tier            = "Free"
  sku_size            = "Free"
}
