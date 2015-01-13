
SPECS := basic blocks builtins data helpers partials regressions string-params subexpressions tokenizer track-ids whitespace-control

all: node_modules
	$(foreach var, $(SPECS), node bin handlebars.js/spec/$(var).js -o spec/$(var).json;)

check_changes:
	@git status --porcelain | grep 'spec/' && return 1 || return 0

test: test_node test_php

test_node:
	@echo ---------- Testing spec against handlebars.js ---------- 
	node bin/runner.js

test_php:
	@echo ---------- Linting PHP code ---------- 
	php bin/lint.php $(foreach var,$(SPECS),spec/$(var).json)

node_modules:
	npm install

.PHONY: all check_changes test test_node test_php
