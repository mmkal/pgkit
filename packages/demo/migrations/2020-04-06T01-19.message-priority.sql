create type message_priority as enum('low', 'medium', 'high');

alter table messages
add column priority message_priority;
