import React, { useEffect } from "react";
import { useSocket } from "./ts/pluto";

function App() {
  useSocket();

  return <div className="App"></div>;
}

export default App;
