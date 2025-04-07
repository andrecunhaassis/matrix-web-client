import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
    content: string;
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
    // Escapar o colchete inicial em linhas que parecem definições de referência
    const modifiedContent = content
        .split("\n")
        .map(line => (/^\[.+\]:/.test(line) ? line.replace("[", "\\[") : line))
        .join("\n");

    return (
        <div className="prose prose-sm max-w-none text-sm break-all">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ node, ...props }) => (
                        <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline hover:text-blue-700"
                        >
                            {props.children}
                        </a>
                    )
                }}
            >
                {modifiedContent}
            </ReactMarkdown>
        </div>
    );
}
