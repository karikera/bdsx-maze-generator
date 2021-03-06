
import { bedrockServer, CANCEL, command } from "bdsx";
import colors = require('colors');

// const ProgressBar:{new():{},render():void,terminate():void,tick():void,update(n:number):void} = require('progress');

function setblock(x:number, y:number, z:number, id:string):number {
    const res = bedrockServer.executeCommand(`setblock ${x} ${y} ${z} ${id}`);
    return res.result;
}

const NEXTS:[number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

class ErrorList {
    private readonly errors = new Map<string, number>();

    add(error:string):void {
        const count = this.errors.get(error);
        this.errors.set(error, (count!|0)+1);
    }

    toString():string {
        return [...this.errors.entries()].map(([k, v])=>v === 1 ? k : `${k} x${v}`).join('\n');
    }
}

function fastRemove<T>(array:T[], index:number):void {
    if (index === array.length-1) {
        array.pop();
    } else {
        array[index] = array.pop()!;
    }
}

function getRandomIndex(array:unknown[]):number {
    return Math.random()*array.length|0;
}

function asfunc<T>(item:T|((...args:any[])=>T)):()=>T {
    if (typeof item !== 'function') {
        return ()=>item;
    }
    return item as any;
}


export class Structure {
    public readonly blocks:(string|null)[];

    constructor(
        public readonly sizex:number, 
        public readonly sizey:number, 
        public readonly sizez:number) {
        const n = sizex * sizey * sizez;
        this.blocks = new Array(n);
        for (let i=0;i<n;i++) {
            this.blocks[i] = null;
        }
    }

    clear(id:string|null):void {
        const n = this.sizex * this.sizey * this.sizez;
        for (let i=0;i<n;i++) {
            this.blocks[i] = id;
        }
    }

    set(x:number, y:number, z:number, blockid:string|null):void {
        this.blocks[((z)*this.sizey+y)*this.sizex+x] = blockid;
    }

    fill(x1:number, y1:number, z1:number, x2:number, y2:number, z2:number, blockId:string|null|((x:number, y:number, z:number)=>string|null)):void {
        blockId = asfunc(blockId);
        x2++;
        y2++;
        z2++;

        const dest = this.blocks;
        let i = ((z1*this.sizey)+y1)*this.sizex+x1;
        let nextY = this.sizex-x2+x1;
        let nextZ = (this.sizey-y2+y1)*this.sizex;
        for (let z=z1;z<z2;z++) {
            for (let y=y1;y<y2;y++) {
                for (let x=x1;x<x2;x++) {
                    dest[i++] = blockId(x, y, z);
                }
                i += nextY;
            }
            i += nextZ;
        }
    }

    box(x1:number, y1:number, z1:number, x2:number, y2:number, z2:number, blockId:string|null|((x:number, y:number, z:number)=>string|null)):void {
        this.fill(x1, y1, z1, x2, y2, z1, blockId); // XY1
        this.fill(x1, y1, z2, x2, y2, z2, blockId); // XY2

        this.fill(x1, y1, z1+1, x1, y2, z2-1, blockId); // YZ1
        this.fill(x2, y1, z1+1, x2, y2, z2-1, blockId); // YZ2
        
        this.fill(x1+1, y1, z1+1, x2-1, y1, z2-1, blockId); // XZ1
        this.fill(x1+1, y2, z1+1, x2-1, y2, z2-1, blockId); // XZ2
    }

    boxWithoutTop(x1:number, y1:number, z1:number, x2:number, y2:number, z2:number, blockId:string|null|((x:number, y:number, z:number)=>string|null)):void {
        this.fill(x1, y1, z1, x2, y2, z1, blockId); // XY1
        this.fill(x1, y1, z2, x2, y2, z2, blockId); // XY2

        this.fill(x1, y1, z1+1, x1, y2, z2-1, blockId); // YZ1
        this.fill(x2, y1, z1+1, x2, y2, z2-1, blockId); // YZ2
        
        this.fill(x1+1, y1, z1+1, x2-1, y1, z2-1, blockId); // XZ1
    }

    /**
     * @returns failed count. returns zero if no errors.
     */
    generate(x:number, y:number, z:number):{message:string, failed:number} {
        const err = new ErrorList;
        let lastMessage = '';
        function canceler(msg:string):CANCEL {
            lastMessage = msg;
            return CANCEL;
        }
        bedrockServer.commandOutput.on(canceler);

        const xe = x + this.sizex;
        const ye = y + this.sizey;
        const ze = z + this.sizez;
        const blocks = this.blocks;
        let i = 0;
        let failed = 0;
        for (let zi=z;zi<ze;zi++) {
            for (let yi=y;yi<ye;yi++) {
                for (let xi=x;xi<xe;xi++) {
                    const block = blocks[i++];
                    if (block === null) continue;
                    if (setblock(xi, yi, zi, block) !== 1) {
                        if (lastMessage !== "The block couldn't be placed") { // same block
                            err.add(lastMessage);
                            failed ++;
                        }
                    }
                }
            }
        }
        bedrockServer.commandOutput.remove(canceler);
        return {
            message: err.toString(),
            failed
        };
    }
}

export function generateMaze(sizeX:number, height:number, sizeZ:number, blockId:string|((x:number, y:number, z:number)=>string), pathWidth:number):Structure {
    const pathWidth_1 = pathWidth+1;
    const xcount = Math.max((((sizeX - 1) / pathWidth_1)|0), 1) - 1;
    const ycount = Math.max((((sizeZ - 1) / pathWidth_1)|0), 1) - 1;

    const wallHeight = Math.max(height-1, 1);
    const structure = new Structure(xcount*pathWidth_1+pathWidth_1+1, wallHeight+1, ycount*pathWidth_1+pathWidth_1+1);
    const topY = wallHeight +1;

    const total = xcount*ycount;
    const blocks:(Wall|null)[] = new Array(total);
    for (let i=0;i<total;i++) {
        blocks[i] = null;
    }

    structure.clear('air');
    structure.boxWithoutTop(0, 0, 0, structure.sizex-1, structure.sizey-1, structure.sizez-1, blockId);

    class GenPoint {
        public readonly grows:Wall[] = [];

        setblock(x:number, y:number):boolean {
            const idx = y*xcount+x;
            if (blocks[idx] !== null) return false;
            const wall = new Wall(x, y, this);
            blocks[idx] = wall;
            this.grows.push(wall);

            const realX = x*pathWidth_1 + pathWidth_1;
            const realY = y*pathWidth_1 + pathWidth_1;
            
            structure.fill(realX, 0, realY, realX, topY, realY, blockId);
            return true;
        }

        wayTo(x1:number, y1:number, next:[number, number]):boolean {
            const x2 = x1 + next[0];
            const y2 = y1 + next[1];

            if (x2 < 0 || y2 < 0 || x2 >= xcount || y2 >= ycount) {
                return false;
            } 

            const idx = y2*xcount+x2;
            if (blocks[idx] !== null) return false;
            const wall = new Wall(x2, y2, this);
            blocks[idx] = wall;
            
            const realX1 = x1*pathWidth_1+pathWidth_1+next[0];
            const realY1 = y1*pathWidth_1+pathWidth_1+next[1];
            
            const realX2 = x2*pathWidth_1+pathWidth_1;
            const realY2 = y2*pathWidth_1+pathWidth_1;

            let minx = 0;
            let miny = 0;
            let maxx = 0;
            let maxy = 0;

            if (realX1 < realX2) {
                minx = realX1;
                maxx = realX2;
            } else {
                minx = realX2;
                maxx = realX1;
            }
            
            if (realY1 < realY2) {
                miny = realY1;
                maxy = realY2;
            } else {
                miny = realY2;
                maxy = realY1;
            }
            
            structure.fill(minx, 0, miny, maxx, topY, maxy, blockId);
            this.grows.push(wall);
            return true;
        }

        grow():boolean {
            while (this.grows.length !== 0) {
                const idx = getRandomIndex(this.grows);
                const wall = this.grows[idx];
                if (!wall.grow()) {
                    fastRemove(this.grows, idx);
                    continue;
                }
                return true;
            }
            return false;
        }
    }
    
    class Wall {
        constructor(
            public readonly x:number,
            public readonly y:number,
            public readonly gp:GenPoint){
        }
        
        grow():boolean {
            const list = NEXTS.slice();
            while (list.length !== 0) {
                const idx = getRandomIndex(list);
                const next = list[idx];
                fastRemove(list, idx);
                if (!this.gp.wayTo(this.x, this.y, next)) continue;
                return true;
            }
            return false;
        }
    }

    function growWall():boolean {
        const wallidx = getRandomIndex(wallgrows);
        const wall = wallgrows[wallidx];
        fastRemove(wallgrows, wallidx);
        if (wall.x < 0) {
            return wall.gp.wayTo(wall.x, wall.y, NEXTS[0]);
        } else if (wall.y < 0) {
            return wall.gp.wayTo(wall.x, wall.y, NEXTS[1]);
        } else if (wall.x >= xcount) {
            return wall.gp.wayTo(wall.x, wall.y, NEXTS[2]);
        } else if (wall.x >= ycount) {
            return wall.gp.wayTo(wall.x, wall.y, NEXTS[3]);
        }
        return false;
    }
    
    const gps:GenPoint[] = [];
    const genPointCount = ((xcount*ycount) / 20)|0 + 1;
    for (let i=0;i<genPointCount;i++) {
        const gp = new GenPoint;
        gps.push(gp);
        for (;;) {
            const ix = (Math.random() * xcount)|0;
            const iy = (Math.random() * ycount)|0;
            if (gp.setblock(ix, iy)) break;
        }
    }

    const wallgp = new GenPoint;
    gps.push(wallgp);
    
    const wallgrows:Wall[] = [];
    for (let x=0;x<xcount;x++) {
        wallgrows.push(new Wall(x, -1, wallgp));
        wallgrows.push(new Wall(x, ycount, wallgp));
    }
    for (let y=0;y<ycount;y++) {
        wallgrows.push(new Wall(-1, y, wallgp));
        wallgrows.push(new Wall(xcount, y, wallgp));
    }

    while (gps.length !== 0) {
        const idx = getRandomIndex(gps);
        const gp = gps[idx];
        if (gp === wallgp) {
            if (wallgrows.length !== 0) {
                if (Math.random() < 2/(gp.grows.length+1)) {
                    while (!growWall() && wallgrows.length !== 0) {}
                } else {
                    if (!gp.grow()) {
                        while (!growWall() && wallgrows.length !== 0) {}
                    }
                }
            } else {
                if (!gp.grow()) {
                    fastRemove(gps, idx);
                }
            }
        } else if (!gp.grow()) {
            fastRemove(gps, idx);
        }
    }

    return structure;
}

command.hook.on((cmd, origin)=>{
    if (origin !== 'Server') return;
    const args = cmd.split(/\s+/g);
    if (args[0] !== '/maze') return;

    function number(str:string):number {
        const n = +str;
        if (isNaN(n) && (n|0) !== n) {
            throw Error(`maze-generator: Invalid integer ${args[1]}. /maze x y z width height blockid [pathWidth]`);
        }
        return n;
    }

    try {
        const x = number(args[1]);
        const y = number(args[2]);
        const z = number(args[3]);
        const sizeX = number(args[4]);
        const height = number(args[5]);
        const sizeZ = number(args[6]);
        const blockid = args[7];
        if (typeof blockid !== 'string') {
            throw Error(`maze-generator: need 6th parameter. /maze x y z sizeX height sizeZ blockid [pathWidth]`);
        }
        const pathWidth = args[8] && number(args[8]);
        
        console.log('maze-generator: Generating');
        const structure = generateMaze(sizeX, height, sizeZ, blockid, pathWidth || 1);
        const failed = structure.generate(x, y, z);
        if (failed.failed !== 0) {
            console.log(colors.red(failed.message));
            console.log(colors.red(`maze-generator: Generate Failed x${failed.failed}`));
        } else console.log('maze-generator: Generated');
    } catch (err) {
        console.error(colors.red(err.message));
        return -1;
    }

    return 0;
});