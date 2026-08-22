# Container Apps Environments require a Log Analytics workspace. Cost is
# usage-based (pay per GB ingested) with no fixed monthly fee -- negligible at
# this project's log volume.
resource "azurerm_log_analytics_workspace" "this" {
  name                = "${var.name_prefix}-logs-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "this" {
  name                       = "${var.name_prefix}-env"
  resource_group_name        = azurerm_resource_group.this.name
  location                   = azurerm_resource_group.this.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}

resource "azurerm_container_app" "server" {
  name                         = "${var.name_prefix}-server"
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  # Only set once the AcrPull role assignment exists and container_image points
  # at the ACR-hosted image (see var.use_acr_registry and tasks.md 6.1).
  dynamic "registry" {
    for_each = var.use_acr_registry ? [1] : []
    content {
      server   = azurerm_container_registry.this.login_server
      identity = "System"
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "server"
      image  = var.container_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "SERVER_PORT"
        value = tostring(var.server_port)
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
    }
  }

  secret {
    name  = "database-url"
    value = var.neon_database_url
  }

  ingress {
    external_enabled = true
    target_port      = var.server_port
    transport        = "auto" # supports plain HTTP and WebSocket upgrades

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_container_app.server.identity[0].principal_id
}
