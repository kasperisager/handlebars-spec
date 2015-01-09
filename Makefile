
SPECS := basic blocks builtins data helpers partials regressions string-params subexpressions tokenizer track-ids utils whitespace-control

all: node_modules
	$(foreach var, $(SPECS), node bin handlebars.js/spec/$(var).js -o spec/$(var).json;)

node_modules:
	npm install

.PHONY: all
