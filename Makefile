# Available targets:
#   make zip-source  - Create sources.zip containing css, html, source, Makefile, .gitignore, and README.MD.
#   make deploy      - Run deploy.sh to deploy files to the configured remote host.
#   make deploy-dry  - Run deploy.sh in dry-run mode to preview deployment changes.

.PHONY: zip-source deploy deploy-dry

ARCHIVE    := sources.zip
ZIP_ITEMS  := css html source Makefile .gitignore README.MD
DEPLOY_SH  := ./deploy.sh

zip-source:
	@rm -f "$(ARCHIVE)"
	@zip -r "$(ARCHIVE)" $(ZIP_ITEMS) -x "*.DS_Store" "*/.DS_Store"
	@echo "Created $(ARCHIVE)"

deploy:
	@$(DEPLOY_SH)

deploy-dry:
	@$(DEPLOY_SH) --dry-run
