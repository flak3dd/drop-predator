/**
 * Redirect: Engine is now part of the Command Center.
 */
import { redirect } from "react-router";

export const loader = () => redirect("/app/command-center");
export default function() { return null; }
