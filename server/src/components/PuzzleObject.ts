import { Component } from '../ecs/Component';

export class PuzzleObject extends Component {
    static type = 'PuzzleObject';

    constructor(
        public puzzleId: string, // To group objects (e.g., "alchemist_puzzle")
        public currentDirection: string = 'north',
        public targetDirection: string | null = null, // null if it doesn't matter
        public isSolved: boolean = false
    ) {
        super();
    }
}
