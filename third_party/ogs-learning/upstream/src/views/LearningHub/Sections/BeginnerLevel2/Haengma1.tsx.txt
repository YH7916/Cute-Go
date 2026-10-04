/*
 * Copyright (C)  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { GobanConfig } from "goban";
import { LearningPage, LearningPageProperties } from "../../LearningPage";
import { _, pgettext } from "@/lib/translate";
import { LearningHubSection } from "../../LearningHubSection";

export class BL2Haengma1 extends LearningHubSection {
    static pages(): Array<typeof LearningPage> {
        return [
            Page01,
            Page02,
            Page03,
            Page04,
            Page05,
            Page06,
            Page07,
            Page08,
            Page09,
            Page10,
            Page11,
            Page12,
            Page13,
            Page14,
            Page15,
            Page16,
            Page17,
        ];
    }
    static section(): string {
        return "bl2-haengma-1";
    }
    static title(): string {
        return pgettext("Tutorial section name on learning bend after attachment 1", "Haengma");
    }
    static subtext(): string {
        return pgettext(
            "Tutorial section subtext on learning on bend after attachment 1",
            "Bend after attachment",
        );
    }
}

class Page01 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _(
            "Haengma is an important go-term from Korea. Haengma indicates the relationship between the stones, the way a group of stones is developing. The Korean word haengma means 'the way, in which the horse moves'. A useful haengma move is to bend ('hane') after an attachment ('tsuke'), in this example by playing at A after White's move 1. This is a strong counter-attack. Black to play. Choose the best reply to attachment 1.",
        );
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "cpdn",
                white: "cqeq",
                /* cSpell:enable */
            },
            marks: { A: "bq", 1: "cq" },
            move_tree: this.makePuzzleMoveTree(["bq"], [], 19, 19),
        };
    }
}

class Page02 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "cp",
                white: "dp",
                /* cSpell:enable */
            },
            marks: { A: "bp", B: "cq", C: "dq", 1: "cp" },
            move_tree: this.makePuzzleMoveTree(["cq"], [], 19, 19),
        };
    }
}

class Page03 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "do",
                white: "dpdq",
                /* cSpell:enable */
            },
            marks: { A: "dn", B: "co", C: "cp", 1: "do" },
            move_tree: this.makePuzzleMoveTree(["co"], [], 19, 19),
        };
    }
}

class Page04 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "ep",
                white: "dpdq",
                /* cSpell:enable */
            },
            marks: { A: "eo", B: "fp", C: "eq", 1: "ep" },
            move_tree: this.makePuzzleMoveTree(["eo"], [], 19, 19),
        };
    }
}

class Page05 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "dq",
                white: "cndp",
                /* cSpell:enable */
            },
            marks: { A: "cp", B: "ep", C: "cq", 1: "dq" },
            move_tree: this.makePuzzleMoveTree(["cq"], [], 19, 19),
        };
    }
}

class Page06 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "co",
                white: "cpdq",
                /* cSpell:enable */
            },
            marks: { A: "do", B: "bp", C: "dp", 1: "co" },
            move_tree: this.makePuzzleMoveTree(["do"], [], 19, 19),
        };
    }
}

class Page07 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("White to play. Choose the best reply to attachment 1, A, B or C?");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "cp",
                white: "dpdr",
                /* cSpell:enable */
            },
            marks: { A: "cq", B: "dq", C: "cr", 1: "cp" },
            move_tree: this.makePuzzleMoveTree(["cq"], [], 19, 19),
        };
    }
}

class Page08 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "dpfp",
                white: "dncp",
                /* cSpell:enable */
            },
            marks: { 1: "cp" },
            move_tree: this.makePuzzleMoveTree(["cq"], [], 19, 19),
        };
    }
}

class Page09 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "ep",
                white: "eocp",
                /* cSpell:enable */
            },
            marks: { 1: "eo" },
            move_tree: this.makePuzzleMoveTree(["fo"], [], 19, 19),
        };
    }
}

class Page10 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "fq",
                white: "dpfp",
                /* cSpell:enable */
            },
            marks: { 1: "fp" },
            move_tree: this.makePuzzleMoveTree(["gp"], [], 19, 19),
        };
    }
}

class Page11 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "dncp",
                white: "epcq",
                /* cSpell:enable */
            },
            marks: { 1: "cq" },
            move_tree: this.makePuzzleMoveTree(["bq"], [], 19, 19),
        };
    }
}

class Page12 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "dq",
                white: "docq",
                /* cSpell:enable */
            },
            marks: { 1: "cq" },
            move_tree: this.makePuzzleMoveTree(["cr"], [], 19, 19),
        };
    }
}

class Page13 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "dphq",
                white: "hpfq",
                /* cSpell:enable */
            },
            marks: { 1: "hp" },
            move_tree: this.makePuzzleMoveTree(["ip"], [], 19, 19),
        };
    }
}

class Page14 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "ep",
                white: "cpeq",
                /* cSpell:enable */
            },
            marks: { 1: "eq" },
            move_tree: this.makePuzzleMoveTree(["fq"], [], 19, 19),
        };
    }
}

class Page15 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "cndpiq",
                white: "dqfq",
                /* cSpell:enable */
            },
            marks: { 1: "dq" },
            move_tree: this.makePuzzleMoveTree(["cq"], [], 19, 19),
        };
    }
}

class Page16 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _("Black to play. Play a good reply (bend) to attachment 1.");
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "black",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "cocpdq",
                white: "cndndoeq",
                /* cSpell:enable */
            },
            marks: { 1: "eq" },
            move_tree: this.makePuzzleMoveTree(["er"], [], 19, 19),
        };
    }
}

class Page17 extends LearningPage {
    constructor(props: LearningPageProperties) {
        super(props);
    }

    text() {
        return _(
            "Instead of an attaching move, you can also be attacked with a shoulder-hit. A shoulder-hit is a move diagonally next to your attacked stone. Often, the best defense is to stretch from your attacked stone. In this example Black plays a shoulder-hit with stone 1. White should defend by stretching his stone at A. The result is that Black's stone 1 leans against a strong formation of two white stones. White to play. Play a good defense against Black 1.",
        );
    }
    config(): GobanConfig {
        return {
            width: 19,
            height: 19,
            mode: "puzzle",
            initial_player: "white",
            bounds: { top: 10, left: 0, bottom: 18, right: 8 },
            initial_state: {
                /* cSpell:disable */
                black: "doeq",
                white: "cp",
                /* cSpell:enable */
            },
            marks: { 1: "do", A: "co" },
            move_tree: this.makePuzzleMoveTree(["co"], [], 19, 19),
        };
    }
}
