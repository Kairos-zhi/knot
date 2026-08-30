import './container';
import { Container } from 'inversify';
import { PlaygroundContainerModule } from '@flowgram.ai/core';
import { FlowDocumentContainerModule } from '@flowgram.ai/document';
import { CommandContainerModule } from '@flowgram.ai/command';
import { WorkflowDocumentContainerModule, WorkflowDocument } from '@flowgram.ai/free-layout-core';

const c = new Container({ defaultScope: 'Singleton' });
c.load(PlaygroundContainerModule);
c.load(FlowDocumentContainerModule);
c.load(WorkflowDocumentContainerModule);
c.load(CommandContainerModule);

const doc = c.get(WorkflowDocument) as any;
console.log('doc ok:', !!doc);
console.log('toJSON:', JSON.stringify(doc.toJSON?.()));
