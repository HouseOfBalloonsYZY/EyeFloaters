// LLM Use
// Gemini 3.0 for ideas and first draft of code:
// https://gemini.google.com/share/b5462be6b908
// https://gemini.google.com/share/f8e539cf04bb
// Gemini Code Assistant for improvement and implementations: (can’t get full conversation for technical reasons) 
// https://fossil-kitten-de8.notion.site/MAT200C-2026-Winter-Prompt-log-320f062facb4809fa241ec042c96bc47?source=copy_link
// Cursor for visual effect help and algorithm improvement:
// https://fossil-kitten-de8.notion.site/cursor_p5_js_project_overview-328f062facb4801581ebd5480a0aa262?source=copy_link


let oceanShader;
let blissImg;
let floaterMaskGfx;
let population = [];
let userDna = null;
let selectedIndices = [];
let harmonics = 15;
let generationCount = 0;

// World State
let currentView = 'incubator'; // 'incubator' or 'ocean'
let isIncubatorFrozen = false;
let oceanCreatures = [];
let toggleBtn;

// UI Layout
let cols = 5;
let rows = 5;
let cellW, cellH;


// User Drawing
let drawingPoints = [];
let isDrawing = false;

let baseShapesPool = [];

// Ocean population control (tiered, population-only; no energy system)
let oceanTier = 1;
let oceanTierEnterMs = 0;

function getOceanTier(popCount)
{
	if (popCount <= 10) return 1;
	if (popCount <= 20) return 2;
	if (popCount <= 30) return 3;
	if (popCount <= 40) return 4;
	return 5;
}

function updateOceanTier(popCount)
{
	const nextTier = getOceanTier(popCount);
	if (nextTier !== oceanTier)
	{
		oceanTier = nextTier;
		oceanTierEnterMs = millis();
	}
}

function getOceanTierAgeSeconds()
{
	return max(0, (millis() - oceanTierEnterMs) / 1000);
}

function chanceFromRatePerSecond(ratePerSecond, dtSeconds)
{
	// Convert a per-second rate to a per-frame probability (frame-rate independent).
	// p = 1 - exp(-lambda * dt)
	return 1 - Math.exp(-ratePerSecond * dtSeconds);
}

function difficultyToReproRate(level)
{
	// Levels: easy, medium, hard, impossible
	// Baseline per-second rates for births.
	if (level === 'easy') return 0.20;
	if (level === 'medium') return 0.09;
	if (level === 'hard') return 0.03;
	return 0.0; // impossible
}

function difficultyToDeathRate(level)
{
	// Levels: easy, medium, hard, impossible
	// Baseline per-second rates for deaths.
	// Slightly higher than reproduction to bias toward sparse stability.
	if (level === 'easy') return 0.26;
	if (level === 'medium') return 0.12;
	if (level === 'hard') return 0.05;
	return 0.0; // impossible
}

function getOceanRates(popCount)
{
	// Requirements mapping:
	// Tier 1 (1-10): asex easy, sex easy, die hard (last 2 impossible)
	// Tier 2 (11-20): asex medium, sex medium, die medium
	// Tier 3 (21-30): asex hard, sex medium, die medium
	// Tier 4 (31-40): asex hard, sex medium, die easy
	// Tier 5 (41+): asex impossible, sex hard, die easy
	const tier = getOceanTier(popCount);

	let asexual = 'hard';
	let sexual = 'medium';
	let death = 'medium';

	if (tier === 1)
	{
		asexual = 'easy';
		sexual = 'easy';
		death = 'hard';
	}
	else if (tier === 2)
	{
		asexual = 'medium';
		sexual = 'medium';
		death = 'medium';
	}
	else if (tier === 3)
	{
		asexual = 'hard';
		sexual = 'medium';
		death = 'medium';
	}
	else if (tier === 4)
	{
		asexual = 'hard';
		sexual = 'medium';
		death = 'easy';
	}
	else
	{
		asexual = 'impossible';
		sexual = 'hard';
		death = 'easy';
	}

	let asexualRate = difficultyToReproRate(asexual);
	let sexualRate = difficultyToReproRate(sexual);
	let deathRate = difficultyToDeathRate(death);

	// Additional slow ramps:
	// - If we stay in tier 1 for >10s, reproduction very slowly increases over time.
	// - If we stay in tier 5 for >10s, death very slowly increases over time.
	const age = getOceanTierAgeSeconds();
	if (tier === 1 && age > 10)
	{
		const ramp = min((age - 10) * 0.01, 0.35); // +1%/s, capped
		asexualRate *= (1 + ramp);
		sexualRate *= (1 + ramp);
	}
	if (tier === 5 && age > 10)
	{
		const ramp = min((age - 10) * 0.01, 0.35);
		deathRate *= (1 + ramp);
	}

	return {
		tier,
		asexualRate,
		sexualRate,
		deathRate,
	};
}

function initializeBaseShapes() {
    const shapeSize = 0.6; // A bit larger for more definition
    const numSamplePoints = 80;

    // 1. Square
    const squarePath = [
        {x: -shapeSize, y: -shapeSize}, {x: shapeSize, y: -shapeSize},
        {x: shapeSize, y: shapeSize},  {x: -shapeSize, y: shapeSize},
    ];
    baseShapesPool.push(generateDnaFromPredefinedPath(squarePath, numSamplePoints));

    // 2. Thin Rectangle
    const rectPath = [
        {x: -shapeSize * 1.5, y: -shapeSize / 4}, {x: shapeSize * 1.5, y: -shapeSize / 4},
        {x: shapeSize * 1.5, y: shapeSize / 4},  {x: -shapeSize * 1.5, y: shapeSize / 4},
    ];
    baseShapesPool.push(generateDnaFromPredefinedPath(rectPath, numSamplePoints));

    // 3. Triangle
    const triPath = [
        {x: 0, y: -shapeSize}, {x: shapeSize, y: shapeSize},
        {x: -shapeSize, y: shapeSize}
    ];
    baseShapesPool.push(generateDnaFromPredefinedPath(triPath, numSamplePoints));

    // 4. Parallelogram
    const paraPath = [
        {x: -shapeSize * 1.2, y: -shapeSize / 2}, {x: shapeSize * 0.8, y: -shapeSize / 2},
        {x: shapeSize * 1.2, y: shapeSize / 2}, {x: -shapeSize * 0.8, y: shapeSize / 2}
    ];
    baseShapesPool.push(generateDnaFromPredefinedPath(paraPath, numSamplePoints));

    console.log("Base shapes initialized:", baseShapesPool.length);
}

function preload()
{
	oceanShader = loadShader("ocean.vert", "ocean.frag");
	blissImg = loadImage("bliss.jpg");
}

function setup()
{
	createCanvas(800, 800, WEBGL);
	cellW = width / cols;
	cellH = height / rows;
	noStroke();

	floaterMaskGfx = createGraphics(width, height);
	floaterMaskGfx.pixelDensity(1);

	initializeBaseShapes(); // Initialize base shapes before populating

	// Initialize random population (skip index 12 which is center)
	for (let i = 0; i < 25; i++)
	{
		if (i === 12)
		{
			population.push(null); // Placeholder for user
		}
		else
		{
			population.push(createRandomDna());
		}
	}

	const controlsDiv = select('#controls');

	toggleBtn = createButton("Show Ocean");
	toggleBtn.parent(controlsDiv);
	toggleBtn.mousePressed(toggleView);

	let moveToOceanBtn = createButton("Move to Ocean");
	moveToOceanBtn.parent(controlsDiv);
	moveToOceanBtn.mousePressed(moveToOcean);

	let btn = createButton("Generate Next Generation");
	btn.parent(controlsDiv);
	btn.mousePressed(nextGeneration);

	let restartBtn = createButton("Restart Randomly");
	restartBtn.parent(controlsDiv);
	restartBtn.mousePressed(restartRandomly);

	let saveBtn = createButton("Save Selected");
	saveBtn.parent(controlsDiv);
	saveBtn.mousePressed(saveSelected);
}

    function toggleView() 
    {
        if (currentView === 'incubator') 
        {
            currentView = 'ocean';
            toggleBtn.html('Show Incubator');
        } 
        else 
        {
            currentView = 'incubator';
            toggleBtn.html('Show Ocean');
        }
    }



function draw() 
{

  if (currentView === 'incubator') {

    drawIncubator();

  } else {

    drawOcean();

  }

}


function calculatePathFromDna(dna, numPoints = 100) {
    let path = [];
    for (let i = 0; i < numPoints; i++) {
        let angle = map(i, 0, numPoints, 0, TWO_PI);
        let x = 0;
        let y = 0;
        for (let k = 0; k < dna.length; k++) {
            let harmonic = dna[k];
            let k_angle = (k + 1) * angle;
            x += harmonic.a * cos(k_angle) + harmonic.b * sin(k_angle);
            y += harmonic.c * cos(k_angle) + harmonic.d * sin(k_angle);
        }
        path.push(createVector(x, y));
    }
    return path;
}


function drawIncubator() {
    if (currentView !== 'incubator') return;

    // --- 1. SETUP ---
    background(30);
    translate(-width / 2, -height / 2);
    
    // --- 2. DRAW ALL CELLS ---
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            let idx = x + y * cols;
            let px = x * cellW + cellW / 2;
            let py = y * cellH + cellH / 2;

            push();
            translate(px, py);

            // Draw cell background/border
            stroke(50);
            noFill();
            rectMode(CENTER);
            rect(0, 0, cellW - 5, cellH - 5);


            let dna = null;
            let state = 0.0; // 0.0 = Empty, 1.0 = Normal, 2.0 = User, 3.0 = Selected
            let isSelected = selectedIndices.includes(idx);

            if (idx === 12) { // User cell
                if (userDna) {
                    dna = userDna;
                    state = 2.0; // Gold
                }
            } else if (population[idx]) { // Population cell
                dna = population[idx];
                state = isSelected ? 3.0 : 1.0; // Green or Blue
            }

            if (dna) {
                let path = calculatePathFromDna(dna);
                
                // --- Scaling Logic ---
                let max_extent = 0;
                for (const p of path) {
                    if (abs(p.x) > max_extent) max_extent = abs(p.x);
                    if (abs(p.y) > max_extent) max_extent = abs(p.y);
                }

                let scale = (cellW - 15) / 2; // Default scale to fit margin
                if (max_extent > 0) {
                   scale = ((cellW - 15) / 2) / max_extent;
                }
                
                // Set color based on state
                if (state === 1.0) { // Normal
                    fill(50, 100, 200, 200);
                    stroke(150, 200, 255);
                    strokeWeight(2);
                } else if (state === 2.0) { // User
                    fill(255, 223, 0, 200);
                    stroke(255, 255, 100);
                    strokeWeight(2);
                } else if (state === 3.0) { // Selected
                    fill(50, 200, 100, 200);
                    stroke(150, 255, 200);
                    strokeWeight(3);
                }

                beginShape();
                for (let p of path) {
                    vertex(p.x * scale, p.y * scale);
                }
                endShape(CLOSE);
            }
            
            pop();
        }
    }

    // --- 3. 2D OVERLAY PASS: Draw special UI for user cell ---
    const userCellX = 12 % cols;
    const userCellY = Math.floor(12 / cols);
    const userPx = userCellX * cellW + cellW / 2;
    const userPy = userCellY * cellH + cellH / 2;

    push();
    translate(userPx, userPy);

    if (isDrawing) {
        stroke(255, 200, 0);
        strokeWeight(2);
        noFill();
        beginShape();
        for (let p of drawingPoints) {
            vertex(p.x - userPx, p.y - userPy);
        }
        endShape();
    } else if (!userDna) { // If not drawing and no DNA exists, show placeholder
        fill(100);
        noStroke();
        textAlign(CENTER, CENTER);
        text("DRAW HERE", 0, 0);
    }
    pop();
}



function renderFloatersMask()
{
	floaterMaskGfx.clear();
	floaterMaskGfx.noFill();
	floaterMaskGfx.blendMode(ADD);

	for (const creature of oceanCreatures)
	{
		const path = calculatePathFromDna(creature.dna);
		const scale = creature.getSize() / 2;
		const x = creature.pos.x;
		const y = creature.pos.y;

		// Soft “jelly edge” mask: darker core + wider faint halo.
		// The shader uses this texture to refract/blur the background.
		floaterMaskGfx.push();
		floaterMaskGfx.translate(x, y);

		// Halo
		floaterMaskGfx.stroke(255, 18);
		floaterMaskGfx.strokeWeight(14);
		floaterMaskGfx.beginShape();
		for (const p of path)
		{
			floaterMaskGfx.vertex(p.x * scale, p.y * scale);
		}
		floaterMaskGfx.endShape(CLOSE);

		// Mid
		floaterMaskGfx.stroke(255, 55);
		floaterMaskGfx.strokeWeight(7);
		floaterMaskGfx.beginShape();
		for (const p of path)
		{
			floaterMaskGfx.vertex(p.x * scale, p.y * scale);
		}
		floaterMaskGfx.endShape(CLOSE);

		// Core
		floaterMaskGfx.stroke(255, 140);
		floaterMaskGfx.strokeWeight(2.5);
		floaterMaskGfx.beginShape();
		for (const p of path)
		{
			floaterMaskGfx.vertex(p.x * scale, p.y * scale);
		}
		floaterMaskGfx.endShape(CLOSE);

		floaterMaskGfx.pop();
	}

	floaterMaskGfx.blendMode(BLEND);
}

function drawOcean()
{
    if (currentView !== 'ocean') return;

	let newCreatures = [];
	let popCount = oceanCreatures.length;
	updateOceanTier(popCount);
	let dtSeconds = max(0.001, deltaTime / 1000);
	const rates = getOceanRates(popCount);

	for (let i = popCount - 1; i >= 0; i--)
	{
		let creature = oceanCreatures[i];
		creature.update(popCount, dtSeconds);

		let offspring = creature.asexualReproduce(popCount, dtSeconds, rates);
		if (offspring)
		{
			newCreatures.push(offspring);
		}

		if (creature.isDead(popCount, dtSeconds, rates))
		{
			oceanCreatures.splice(i, 1);
		}
	}
    
	// Check for collisions and sexual reproduction
	for (let i = 0; i < oceanCreatures.length; i++)
	{
		for (let j = i + 1; j < oceanCreatures.length; j++)
		{
			let creatureA = oceanCreatures[i];
			let creatureB = oceanCreatures[j];
			if (creatureA.collides(creatureB))
			{
				creatureA.resolveCollision(creatureB);
				let offspring = creatureA.reproduce(creatureB, popCount, dtSeconds, rates);
				if (offspring)
				{
					newCreatures.push(offspring);
				}
			}
		}
	}

	oceanCreatures = oceanCreatures.concat(newCreatures);

	renderFloatersMask();

	shader(oceanShader);
	oceanShader.setUniform('u_time', millis() / 1000.0);
	oceanShader.setUniform('u_resolution', [width, height]);
	oceanShader.setUniform('u_bg', blissImg);
	oceanShader.setUniform('u_mask', floaterMaskGfx);

	push();
	noStroke();
	translate(0, 0, -1); // Pushed back to avoid z-fighting
	rectMode(CENTER);
	rect(0, 0, width, height);
	pop();
	resetShader();

    if (oceanCreatures.length === 0) 
    {
        push();
        resetMatrix();
        fill(255);
        textAlign(CENTER, CENTER);
        text("The Ocean is currently empty.", width / 2, height / 2);
        pop();
    }
}



function moveToOcean() 
{
    if (selectedIndices.length === 0) 
    {
        alert("Please select creatures from the incubator to move to the ocean.");
        return;
    }

    for (let index of selectedIndices) 
    {
        if (population[index]) 
        {
            let dna = cloneDna(population[index]);
            oceanCreatures.push(new OceanCreature(dna));
            fillEmptyIncubatorSlot(index);
        }
    }

    console.log(`Moved ${selectedIndices.length} creatures. Ocean population: ${oceanCreatures.length}`);
    selectedIndices = []; // Clear selection
}

function fillEmptyIncubatorSlot(index) 
{
    let breedingPool = population.filter(p => p !== null);
    if (breedingPool.length === 0) 
    {
        // Fallback to a random creature if the pool is empty
        population[index] = createRandomDna();
        return;
    }

    let child;
    let choice = random(1);

    if (breedingPool.length === 1 || choice < 0.5) 
    { 
        // Asexual reproduction
        let parent = random(breedingPool);
        child = cloneDna(parent);
        mutate(child, 1.0);
    }
    else 
    { 
        // Sexual reproduction
        let parentA = random(breedingPool);
        let parentB = random(breedingPool);
        while (parentA === parentB) 
        {
            parentB = random(breedingPool);
        }
        child = crossover(parentA, parentB);
        mutate(child, 0.5);
    }
    population[index] = child;
}


function nextGeneration() 
{
    // 1. Gather parents from user selection and drawing
    let parents = [];
    for (let idx of selectedIndices) 
    {
        if (population[idx]) 
        {
            parents.push(population[idx]);
        }
    }

    // Add user's drawing to the parent pool if it exists
    if (userDna) 
    {
        parents.push(userDna);
    }
    
    // 2. Enforce at least one parent
    if (parents.length === 0) 
    {
        alert("Please select at least one shape or draw your own to generate the next generation.");
        return;
    }

    // 3. Build the weighted breeding pool
    let breedingPool = [];
    
    // Distribute a total weight of 16 among the selected/drawn parents
    const totalWeightForSelected = 16;
    if (parents.length > 0) 
    {
        const weightPerParent = floor(totalWeightForSelected / parents.length);
        let remainder = totalWeightForSelected % parents.length;

        for (const parent of parents) 
        {
            let copies = weightPerParent;
            if (remainder > 0) 
            {
                copies++;
                remainder--;
            }
            for (let i = 0; i < copies; i++) 
            {
                breedingPool.push(parent);
            }
        }
    }
    
    // Add the 4 base shapes with a random, changing weight each generation
    for (const baseShape of baseShapesPool) {
        let weight = floor(random(1, 4)); // Random weight from 1 to 3
        for (let i = 0; i < weight; i++) {
            breedingPool.push(baseShape);
        }
    }
    
    // 4. Breed a new population
    let newPopulation = new Array(25);
    let startIndex = 0;

    // Preserve the user's drawing by placing it in the first available slot
    // Note: It was already used for breeding above, this makes it available for selection next round.
    if (userDna) {
        if (startIndex === 12) startIndex++; // Skip center if it's the first slot
        newPopulation[startIndex] = userDna;
        startIndex++;
    }

    for (let i = startIndex; i < 25; i++) {
        if (i === 12) continue; // Skip center

        // If we filled the slot with userDna, skip filling it again
        if (newPopulation[i] !== undefined) continue;

        let child;
        let choice = random(1);

        if (choice < 0.2) { // 20% chance: large mutation of one parent
            child = createChildFromLargeMutation(breedingPool);
        } else if (choice < 0.7) { // 50% chance: two parents mate
            child = createChildFromTwoParents(breedingPool);
        } else { // 30% chance: one parent "self-mates"
            child = createChildFromSelfMating(breedingPool);
        }
        newPopulation[i] = child;
    }
    
    population = newPopulation;
    population[12] = null; // Ensure center is always empty

    // 5. Reset for next generation
    selectedIndices = [];
    userDna = null;
    drawingPoints = [];

    generationCount++;
    console.log("Generation: " + generationCount);
}


function restartRandomly() 
{
    console.log("Restarting with a completely new random generation.");
    for (let i = 0; i < 25; i++) 
    {
        if (i === 12) 
        {
            population[i] = null;
        } 
        else 
        {
            population[i] = createRandomDna();
        }
    }

    // Reset everything else
    selectedIndices = [];
    userDna = null;
    drawingPoints = [];
    generationCount = 0;
}

// Deep clones a DNA object
function cloneDna(dna) {
    return JSON.parse(JSON.stringify(dna));
}

function createChildFromLargeMutation(pool) {
    let parent = random(pool);
    let child = cloneDna(parent);
    mutate(child, 3.0); // Large mutation factor
    return child;
}

function createChildFromTwoParents(pool) {
    let parentA = random(pool);
    let parentB = random(pool);
    
    // Ensure parents are different if possible
    if (pool.length > 1) {
        while (parentA === parentB) { // This comparison works for objects in JS
            parentB = random(pool);
        }
    }

    let mutantA = cloneDna(parentA);
    let mutantB = cloneDna(parentB);

    // 50% chance for each parent to undergo a small mutation
    if (random(1) < 0.5) mutate(mutantA, 1.0);
    if (random(1) < 0.5) mutate(mutantB, 1.0);

    return crossover(mutantA, mutantB);
}

function createChildFromSelfMating(pool) {
    let parent = random(pool);
    let variant1 = cloneDna(parent);
    let variant2 = cloneDna(parent);
    
    // Each variant undergoes the "mutate or not" process independently
    mutate(variant1, 1.0);
    mutate(variant2, 1.0);

    return crossover(variant1, variant2);
}


function crossover(dnaA, dnaB) {
  let newDna = [];
  // Random splice point (Split the DNA strand)
  let mid = floor(random(harmonics));

  for (let i = 0; i < harmonics; i++) {
    if (i < mid) {
      newDna[i] = { ...dnaA[i] };
    } else {
      newDna[i] = { ...dnaB[i] };
    }
  }
  return newDna;
}

function mutate(dna, mutationFactor = 1.0) {
  let mutationRate = 0.2; // Slightly higher base rate

  for (let i = 0; i < harmonics; i++) {
    if (random(1) < mutationRate) {
      // The amount of mutation decreases for higher harmonics to preserve the general shape
      let amount = map(i, 0, harmonics, 0.1, 0.25) * mutationFactor;
      dna[i].a += random(-amount, amount);
      dna[i].b += random(-amount, amount);
      dna[i].c += random(-amount, amount);
      dna[i].d += random(-amount, amount);
    }
  }
}

function createRandomDna() {
  let dna = [];
  for (let i = 0; i < harmonics; i++) {
    let dropoff = 1.5 / (i + 1);
    dna.push({
      a: random(-0.5, 0.5) * dropoff,
      b: random(-0.5, 0.5) * dropoff,
      c: random(-0.5, 0.5) * dropoff,
      d: random(-0.5, 0.5) * dropoff,
    });
  }
  return dna;
}

function mousePressed() {
  if (currentView === 'incubator') {
    let mx = mouseX;
    let my = mouseY;

    if (mx > 0 && mx < width && my > 0 && my < height) {
      let gx = floor(mx / cellW);
      let gy = floor(my / cellH);
      let idx = gx + gy * cols;

      // CENTER CELL: Start Drawing
      if (idx === 12) {
        isDrawing = true;
        drawingPoints = [];
        userDna = null;
      }
      // OTHER CELLS: Toggle Selection
      else {
        let pos = selectedIndices.indexOf(idx);
        if (pos === -1) {
          selectedIndices.push(idx);
        } else {
          selectedIndices.splice(pos, 1);
        }
      }
    }
  }
}

function mouseDragged() {
  if (isDrawing && currentView === 'incubator') {
    let cx = 2 * cellW + cellW / 2;
    let cy = 2 * cellH + cellH / 2;
    if (dist(mouseX, mouseY, cx, cy) < cellW / 2) {
      drawingPoints.push({ x: mouseX, y: mouseY });
    }
  }
}

function mouseReleased() {
  if (isDrawing && currentView === 'incubator') {
    isDrawing = false;
    if (drawingPoints.length > 10) {
        // This function will now calculate and set the global userDna
        generateDnaFromUserDrawing(drawingPoints);
    }
  }
}

function resamplePath(path, numPoints) {
    if (path.length < 2) return [];

    const newPoints = [];
    const closedPath = [...path, path[0]];
    let totalLength = 0;

    for (let i = 0; i < closedPath.length - 1; i++) {
        totalLength += dist(closedPath[i].x, closedPath[i].y, closedPath[i+1].x, closedPath[i+1].y);
    }

    if (totalLength === 0) return new Array(numPoints).fill(path[0]);

    const interval = totalLength / numPoints;
    let accumulatedDist = 0;

    newPoints.push({ x: path[0].x, y: path[0].y });

    let currentPathIndex = 0;
    let p1 = closedPath[currentPathIndex];
    let p2 = closedPath[currentPathIndex + 1];
    
    for (let i = 1; i < numPoints; i++) {
        let targetDist = i * interval;
        
        while(accumulatedDist + dist(p1.x, p1.y, p2.x, p2.y) < targetDist) {
            accumulatedDist += dist(p1.x, p1.y, p2.x, p2.y);
            currentPathIndex++;
            p1 = closedPath[currentPathIndex];
            p2 = closedPath[currentPathIndex+1];
        }
        
        let segmentDist = dist(p1.x, p1.y, p2.x, p2.y);
        let distNeeded = targetDist - accumulatedDist;
        let ratio = distNeeded / segmentDist;
        
        if (segmentDist === 0) { // Handle cases with duplicate points
             newPoints.push({x: p1.x, y: p1.y});
             continue;
        }

        let x = lerp(p1.x, p2.x, ratio);
        let y = lerp(p1.y, p2.y, ratio);
        newPoints.push({ x, y });
    }

    return newPoints;
}

function generateDnaFromPredefinedPath(path, numSamplePoints) {
    const resampled = resamplePath(path, numSamplePoints);

    let dna = [];
    const N = resampled.length;

    for (let k = 1; k <= harmonics; k++) {
        let ak = 0, bk = 0, ck = 0, dk = 0;
        for (let n = 0; n < N; n++) {
            let phi = (TWO_PI * k * n) / N;
            let p = resampled[n];
            ak += p.x * cos(phi);
            bk += p.x * sin(phi);
            ck += p.y * cos(phi);
            dk += p.y * sin(phi);
        }
        const scale = 2 / N;
        ak *= scale; bk *= scale; ck *= scale; dk *= scale;
        dna.push({ a: ak, b: bk, c: ck, d: dk });
    }
    return dna;
}

function generateDnaFromUserDrawing(path) {
  const numSamplePoints = 80;
  const resampled = resamplePath(path, numSamplePoints);
  
  if (resampled.length < numSamplePoints) {
    console.error("Resampling failed to produce enough points.");
    return;
  }

  const cx = 2 * cellW + cellW / 2;
  const cy = 2 * cellH + cellH / 2;
  const centeredPoints = resampled.map(p => ({
    x: (p.x - cx) / (cellW * 0.4),
    y: (p.y - cy) / (cellH * 0.4),
  }));

  let dna = [];
  const N = centeredPoints.length;

  for (let k = 1; k <= harmonics; k++) {
    let ak = 0, bk = 0, ck = 0, dk = 0;
    for (let n = 0; n < N; n++) {
      let phi = (TWO_PI * k * n) / N;
      let p = centeredPoints[n];
      ak += p.x * cos(phi);
      bk += p.x * sin(phi);
      ck += p.y * cos(phi);
      dk += p.y * sin(phi);
    }
    const scale = 2 / N;
    ak *= scale; bk *= scale; ck *= scale; dk *= scale;
    dna.push({ a: ak, b: bk, c: ck, d: dk });
  }
  userDna = dna; // Set the global DNA
}

function dnaToFlatArray(dna) {
  let arr = [];
  for (let gene of dna) {
    arr.push(gene.a, gene.b, gene.c, gene.d);
  }
  return arr;
}

function saveSelected() {
  save("biomorph_generation_" + generationCount + ".jpg");
}

class OceanCreature {
	constructor(dna, opts = {})
	{
		this.dna = dna;
		this.pos = opts.pos ? opts.pos.copy() : createVector(random(width), random(height));

		const startVel = opts.vel ? opts.vel.copy() : p5.Vector.random2D().mult(random(0.6, 0.8));
		this.vel = startVel;

		this.baseSize = opts.size ?? random(30, 60);
		this.spawnAge = 0;
		this.spawnFrames = opts.spawnFrames ?? 55;

		this.cruiseSpeed = opts.cruiseSpeed ?? 0.7;
		this.maxSpeed = 1.0;
		this.reproCooldown = opts.reproCooldown ?? 60;
		this.bumpCounters = new Map();
	}

	getSize()
	{
		const t = constrain(this.spawnAge / this.spawnFrames, 0, 1);
		const ease = t * t * (3 - 2 * t);
		// Newborns need enough collision radius to separate cleanly.
		return lerp(this.baseSize * 0.35, this.baseSize, ease);
	}

	update(populationCount, dtSeconds)
	{
		this.spawnAge++;

		// Mostly straight-line drift (direction changes mainly via bumps/edges).
		this.vel.limit(this.maxSpeed);
		if (this.vel.mag() < this.cruiseSpeed)
		{
			this.vel.setMag(this.cruiseSpeed);
		}

		this.pos.add(this.vel);
		this.edges();

		this.reproCooldown = max(0, this.reproCooldown - 1);
	}

	collides(other)
	{
		let d = dist(this.pos.x, this.pos.y, other.pos.x, other.pos.y);
		return d < (this.getSize() / 2 + other.getSize() / 2);
	}

	resolveCollision(other)
	{
		// Increment bump counter
		let currentBumps = this.bumpCounters.get(other) || 0;
		this.bumpCounters.set(other, currentBumps + 1);
		other.bumpCounters.set(this, (other.bumpCounters.get(this) || 0) + 1);

		const sizeA = this.getSize();
		const sizeB = other.getSize();
		const minDist = sizeA / 2 + sizeB / 2;

		let delta = p5.Vector.sub(this.pos, other.pos);
		let d = delta.mag();
		if (d === 0)
		{
			delta = p5.Vector.random2D();
			d = 1;
		}

		const overlap = minDist - d;
		if (overlap <= 0)
		{
			return;
		}

		// Soft “prokaryote” push apart (springy separation + velocity blending).
		const n = delta.copy().div(d);
		const newbornA = this.spawnAge < this.spawnFrames;
		const newbornB = other.spawnAge < other.spawnFrames;
		const pushStrength = (newbornA || newbornB) ? 1.25 : 0.22;
		const push = overlap * pushStrength;
		this.pos.add(n.copy().mult(push));
		other.pos.sub(n.copy().mult(push));

		// Instead of rigid impulse, slightly align velocities and damp on contact.
		const avg = p5.Vector.add(this.vel, other.vel).mult(0.5);
		this.vel.lerp(avg, 0.22);
		other.vel.lerp(avg, 0.22);

		// If a newborn is involved, add a separating velocity impulse so they don't pin to walls/corners.
		if (newbornA || newbornB)
		{
			const kick = min(0.55, 0.10 + overlap * 0.35);
			this.vel.add(n.copy().mult(kick));
			other.vel.sub(n.copy().mult(kick));
		}

		// Lossless bumps: don't drain kinetic energy here.
	}


	reproduce(partner, populationCount, dtSeconds, rates)
	{
		const requiredBumps = floor(map(populationCount, 2, 15, 1, 5, true));

		if (this.reproCooldown !== 0 || partner.reproCooldown !== 0)
		{
			return null;
		}

		if ((this.bumpCounters.get(partner) || 0) < requiredBumps)
		{
			return null;
		}

		// Population-only: chance gating
		const p = chanceFromRatePerSecond(rates.sexualRate, dtSeconds);
		if (random(1) >= p)
		{
			return null;
		}

		this.reproCooldown = 180;
		partner.reproCooldown = 180;

		// Reset bump counters after reproduction
		this.bumpCounters.set(partner, 0);
		partner.bumpCounters.set(this, 0);

		// Sexual reproduction:
		// 50% chance: mild mutation on each parent variant before crossover; otherwise no mutation.
		let variantA = cloneDna(this.dna);
		let variantB = cloneDna(partner.dna);
		if (random(1) < 0.5)
		{
			mutate(variantA, 0.6);
			mutate(variantB, 0.6);
		}

		let childDna = crossover(variantA, variantB);

		const between = p5.Vector.sub(partner.pos, this.pos);
		const dir = between.mag() > 0 ? between.copy().normalize() : p5.Vector.random2D();
		const spawnPos = p5.Vector.add(this.pos, partner.pos).div(2).add(dir.copy().mult(this.getSize() * 0.65));

		const childDir = p5.Vector.random2D();
		const inherited = p5.Vector.add(this.vel, partner.vel).mult(0.08);
		const spawnVel = childDir.setMag(this.cruiseSpeed).add(inherited);

		let child = new OceanCreature(childDna,
		{
			pos: spawnPos,
			vel: spawnVel,
			size: lerp(this.baseSize, partner.baseSize, 0.5),
			spawnFrames: 75,
			reproCooldown: 90,
			cruiseSpeed: this.cruiseSpeed,
		});

		return child;
	}
  
	asexualReproduce(populationCount, dtSeconds, rates)
	{
		// Population-only: chance gating
		const p = chanceFromRatePerSecond(rates.asexualRate, dtSeconds);
		if (random(1) >= p)
		{
			return null;
		}

		let childDna = cloneDna(this.dna);
		// Asexual reproduction: relatively large mutation
		mutate(childDna, 2.2);

		const dir = p5.Vector.random2D();
		const offset = dir.copy().mult(this.getSize() * 0.85);
		const spawnPos = this.pos.copy().add(offset);
		const spawnVel = dir.copy().setMag(this.cruiseSpeed).add(this.vel.copy().mult(0.06));

		let child = new OceanCreature(childDna,
		{
			pos: spawnPos,
			vel: spawnVel,
			size: this.baseSize * random(0.85, 1.05),
			spawnFrames: 70,
			reproCooldown: 70,
			cruiseSpeed: this.cruiseSpeed,
		});

		return child;
	}

	display()
	{
		// CPU drawing is no longer used for the ocean visuals (shader does it),
		// but we keep this method in case we want debug overlays later.
	}
    
	isDead(populationCount, dtSeconds, rates)
	{
		// The last 2 creatures are impossible to die out.
		if (populationCount <= 2)
		{
			return false;
		}

		const p = chanceFromRatePerSecond(rates.deathRate, dtSeconds);
		return random(1) < p;
	}

	edges()
	{
		const r = this.getSize() / 2;
		let bounced = false;
		let bouncedX = false;
		let bouncedY = false;
		const eps = 0.01;
		if (this.pos.x < r)
		{
			this.pos.x = r + eps;
			this.vel.x *= -1.0;
			bounced = true;
			bouncedX = true;
		}
		else if (this.pos.x > width - r)
		{
			this.pos.x = width - r - eps;
			this.vel.x *= -1.0;
			bounced = true;
			bouncedX = true;
		}

		if (this.pos.y < r)
		{
			this.pos.y = r + eps;
			this.vel.y *= -1.0;
			bounced = true;
			bouncedY = true;
		}
		else if (this.pos.y > height - r)
		{
			this.pos.y = height - r - eps;
			this.vel.y *= -1.0;
			bounced = true;
			bouncedY = true;
		}

		// Anti-stiction: if we bounced into a corner repeatedly, ensure we leave it.
		if (bounced)
		{
			// Very slight wall “bounce randomness” to prevent corner pinning.
			// Only applied when we actually hit a wall.
			const jitter = random(-0.12, 0.12);
			this.vel.rotate(jitter);

			if (abs(this.vel.x) < 0.08)
			{
				this.vel.x = (this.vel.x >= 0 ? 1 : -1) * 0.08;
			}
			if (abs(this.vel.y) < 0.08)
			{
				this.vel.y = (this.vel.y >= 0 ? 1 : -1) * 0.08;
			}

			// If we hit both walls (corner), bias slightly away from the corner.
			if (bouncedX && bouncedY)
			{
				const away = createVector(
					this.pos.x < width / 2 ? 1 : -1,
					this.pos.y < height / 2 ? 1 : -1
				).setMag(0.05);
				this.vel.add(away);
			}

			if (this.vel.mag() < this.cruiseSpeed)
			{
				this.vel.setMag(this.cruiseSpeed);
			}
		}
	}
}
