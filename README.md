## @bdsx/maze-generator
![image](./render.gif)

## Command
* `/maze x y z size_x height size_z block_id [path_width]`

## API Example
```ts
import { generateMaze } from '@bdsx/maze-generator';

const structure = generateMaze(50, 4, 50, 'stone', 2);
structure.generate(0, 70, 0); // generate
```