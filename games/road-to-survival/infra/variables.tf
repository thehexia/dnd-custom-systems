variable "location" {
  description = "Azure region for the resource group, ACR, and Container Apps environment."
  type        = string
  default     = "eastus"
}

variable "static_web_app_location" {
  description = "Azure region for the Static Web App. Static Web Apps are only available in a small set of regions, independent of `location`."
  type        = string
  default     = "eastus2"
}

variable "resource_group_name" {
  description = "Name of the resource group holding all road-to-survival Azure resources."
  type        = string
  default     = "rg-road-to-survival"
}

variable "name_prefix" {
  description = "Prefix used when naming resources (lowercase alphanumeric, no hyphens where the resource type disallows them)."
  type        = string
  default     = "rts"
}

variable "server_port" {
  description = "Port the Colyseus/Express server listens on inside the container; must match the Container App ingress target port."
  type        = number
  default     = 2567
}

variable "container_image" {
  description = "Full image reference the Container App runs. Defaults to a public placeholder so the first `terraform apply` can succeed before the real server image is built and pushed to ACR (see tasks.md 3.6 and 6.1)."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "use_acr_registry" {
  description = "Whether the Container App should authenticate to the Container Registry via its managed identity. Leave false for the initial apply (placeholder public image, no registry auth needed yet); set true once the AcrPull role assignment exists and `container_image` points at the ACR-hosted server image."
  type        = bool
  default     = false
}

variable "neon_database_url" {
  description = "Neon Postgres connection string (include `sslmode=require`), supplied via TF_VAR_neon_database_url -- never committed to a file."
  type        = string
  sensitive   = true
}
