import React from "react";

interface Data {
  title: string;
  text: string;
}

export function render(data: Data) {
  return <div className="card">
    <h3>{data.title}</h3>
    <p>{data.text}</p>
    <p>Another waaaaa</p>
    {/* <pre>{JSON.stringify(data, null, "    ")}</pre> */}
  </div>
}