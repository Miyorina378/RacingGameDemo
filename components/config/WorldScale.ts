/**
 * World scale: one unit is one metre, and every car is drawn at its real size.
 * Physics already works that way (gravity 9.81, km/h / 3.6, real wheelbases), and
 * track lengths are real too: the Swordfish course is Fuji Speedway's 4.5 km with
 * its 1.48 km straight.
 *
 * Track *widths* were not. They were laid out around a Ford GT drawn at 7.2 m,
 * 1.55x its real 4.643 m, so roads, curbs and grass came out 1.55x too wide for a
 * real-size car. Every race track, license test and custom track is narrowed by
 * this factor when it is resolved (see scaleTrackWidths in modes/trackNodes.ts),
 * so authored numbers stay as they were written.
 */
export const TRACK_WIDTH_SCALE = 4.643 / 7.2;
