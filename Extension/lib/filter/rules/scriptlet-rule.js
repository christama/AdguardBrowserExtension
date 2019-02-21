/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

(function (adguard, api) {
    const stringUtils = adguard.utils.strings;

    /**
     * AdGuard scriptlet rule mask
     */
    const ADG_SCRIPTLET_MASK_REG = /\/\/scriptlet/;

    /**
     * Helper to accumulate an array of strings char by char
     */
    function wordSaver() {
        let str = '';
        let strs = [];
        saveSymb = (s) => str += s;
        saveStr = () => {
            strs.push(str);
            str = '';
        };
        getAll = () => [...strs];
        return { saveSymb, saveStr, getAll };
    };

    /**
     * Iterate over iterable argument and evaluate current state with transitions
     * @param {string} init first transition name
     * @param {Array|Collection|string} iterable
     * @param {Object} transitions transtion functions
     * @param {any} args arguments which should be passed to transition functions
     */
    function iterateWithTransitions(iterable, transitions, init, args) {
        let state = init || Object.keys(transitions)[0];
        for (let i = 0; i < iterable.length; i++) {
            state = transitions[state](iterable, i, args);
        }
        return state;
    }

    /**
     * Parse and validate scriptlet rule
     * @param {*} ruleText 
     * @returns {{name: string, args: Array<string>}}
     */
    function parseRule(ruleText) {
        ruleText = stringUtils.getAfterRegExp(ruleText, ADG_SCRIPTLET_MASK_REG);
        /**
         * Transition names
         */
        const TRANSTION = {
            OPENED: 'opened',
            PARAM: 'param',
            CLOSED: 'closed',
        };

        /**
         * Transition function: the current index position in start, end or between params
         * @param {string} rule 
         * @param {number} index 
         * @param {Object} Object
         * @property {Object} Object.sep contains prop symb with current separator char
         */
        const opened = (rule, index, { sep }) => {
            const char = rule[index];
            switch (char) {
                case ' ':
                case '(':
                case ',':
                    return TRANSTION.OPENED;
                case '\'':
                case '"':
                    sep.symb = char;
                    return TRANSTION.PARAM
                case ')':
                    return index === rule.length - 1
                        ? TRANSTION.CLOSED
                        : TRANSTION.OPENED;
            };
        };
        /**
         * Transition function: the current index position inside param
         * @param {string} rule 
         * @param {number} index 
         * @param {Object} Object
         * @property {Object} Object.sep contains prop `symb` with current separator char
         * @property {Object} Object.saver helper which allow to save strings by car by char
         */
        const param = (rule, index, { saver, sep }) => {
            const char = rule[index];
            switch (char) {
                case '\'':
                case '"':
                    const before = rule[index - 1];
                    if (char === sep.symb && before !== '\\') {
                        sep.symb = null;
                        saver.saveStr();
                        return TRANSTION.OPENED;
                    }
                default:
                    saver.saveSymb(char);
                    return TRANSTION.PARAM;
            }
        }
        const transitions = { 
            [TRANSTION.OPENED]: opened, 
            [TRANSTION.PARAM]: param,
            [TRANSTION.CLOSED]: () => { }
        };
        const sep = { symb: null };
        const saver = wordSaver();
        const state = iterateWithTransitions(ruleText, transitions, TRANSTION.OPENED, { sep, saver });
        if (state !== 'closed') {
            throw new Error(`Invalid scriptlet rule ${ruleText}`);
        }

        const args = saver.getAll();
        return {
            name: args[0],
            args: args.slice(1)
        };
    }


    /**
     * JS Scriplet rule from scriptlet dictionary
     * @constructor ScriptletRule
     * @param {Object} source
     * @property {string}  source.name Scriptlets name
     * @property {Array<string>}  source.args Arguments which need to pass in scriptlet
     */
    function ScriptletRule(ruleText, filterId) {
        this.ruleText = ruleText;
        this.filterId = filterId;
        this.scriptSource = 'local';
        this.whiteListRule = ruleText.includes(api.FilterRule.MASK_SCRIPT_EXCEPTION_RULE);
        const mask = this.whiteListRule
            ? api.FilterRule.MASK_SCRIPT_EXCEPTION_RULE
            : api.FilterRule.MASK_SCRIPT_RULE;
        const domain = adguard.utils.strings.substringBefore(ruleText, mask);
        domain && this.loadDomains(domain);
        const scriptletParam = {
            engine: 'extension',
            version: adguard.app.getVersion(),
            ...parseRule(ruleText),
        };
        this.script = scriptlets && scriptlets.invoke(scriptletParam);
    };

    /**
     * Check is AdGuard scriptlet rule
     * @static
     */
    ScriptletRule.isAdguardScriptletRule = rule => ADG_SCRIPTLET_MASK_REG.test(rule);

    /**
     * Extends BaseFilterRule
     */
    ScriptletRule.prototype = Object.create(api.FilterRule.prototype);

    /**
     * @static ScriptletRule
     */
    api.ScriptletRule = ScriptletRule;

})(adguard, adguard.rules);

