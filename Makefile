
SPECS := basic blocks builtins data helpers partials regressions string-params subexpressions tokenizer track-ids utils whitespace-control

all: node_modules
	$(foreach var, $(SPECS), node bin handlebars.js/spec/$(var).js -o spec/$(var).json;)

check_changes:
	@git status --porcelain | grep 'spec/' && return 1 || return 0

test:
	node bin/runner.js

node_modules:
	npm install

.PHONY: all
