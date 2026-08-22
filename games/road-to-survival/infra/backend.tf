# Remote state lives in the pre-existing hnguyentfstate storage account.
# This backend block intentionally never declares that storage account or its
# container as managed resources (see specs/road-to-survival-azure-infra: State
# Backend Uses Pre-Existing Storage) -- Terraform can't create the backend it
# depends on.
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "hnguyentfstate"
    container_name       = "tfstate"
    key                  = "road-to-survival/terraform.tfstate"
  }
}
