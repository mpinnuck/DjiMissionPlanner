.PHONY: zip-source

ARCHIVE := sources.zip
ZIP_ITEMS := css html source Makefile .gitignore README.MD

zip-source:
	@rm -f "$(ARCHIVE)"
	@zip -r "$(ARCHIVE)" $(ZIP_ITEMS) -x "*.DS_Store" "*/.DS_Store"
	@echo "Created $(ARCHIVE)"